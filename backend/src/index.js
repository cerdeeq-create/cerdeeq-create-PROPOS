const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('path');
const { pool } = require('./db');
const { ensureDefaultUsers } = require('./auth');
const { ensureStarterProducts } = require('./shopData');
const {
  validateProductPayload,
  validateSalePayload,
  validatePurchaseOrderPayload,
  validateReceivingPayload,
  validateServiceTransactionPayload,
  validateSocialAccountLinkInitPayload,
  validateMediaImportRequestPayload,
  validateSocialAccountLinkCompletePayload,
} = require('./validation');

const JWT_SECRET = process.env.JWT_SECRET || 'pos_jwt_secret';
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4000);
const FRONTEND_BUILD_PATH = process.env.FRONTEND_BUILD_PATH || path.resolve(__dirname, '..', '..', 'frontend', 'build');
const TOKEN_ENCRYPTION_SECRET = process.env.TOKEN_ENCRYPTION_SECRET || 'dev-token-encryption-secret-change-me-32-bytes-min';
const TOKEN_REFRESH_LEEWAY_SECONDS = Number(process.env.TOKEN_REFRESH_LEEWAY_SECONDS || 120);

const OAUTH_PROVIDER_CONFIG = {
  tiktok: {
    clientId: process.env.TIKTOK_CLIENT_ID || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    authorizeUrl: process.env.TIKTOK_OAUTH_AUTHORIZE_URL || '',
    tokenUrl: process.env.TIKTOK_OAUTH_TOKEN_URL || '',
    redirectUri: process.env.TIKTOK_OAUTH_REDIRECT_URI || '',
    scope: process.env.TIKTOK_OAUTH_SCOPE || 'video.list,user.info.basic',
    mediaListUrl: process.env.TIKTOK_MEDIA_LIST_URL || '',
  },
  facebook: {
    clientId: process.env.FACEBOOK_CLIENT_ID || '',
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
    authorizeUrl: process.env.FACEBOOK_OAUTH_AUTHORIZE_URL || '',
    tokenUrl: process.env.FACEBOOK_OAUTH_TOKEN_URL || '',
    redirectUri: process.env.FACEBOOK_OAUTH_REDIRECT_URI || '',
    scope: process.env.FACEBOOK_OAUTH_SCOPE || 'pages_read_engagement,pages_show_list',
    mediaListUrl: process.env.FACEBOOK_MEDIA_LIST_URL || '',
  },
};
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = parsedUrl;

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (req.method === 'GET' && !pathname.startsWith('/api')) {
      const served = tryServeFrontend(req, res, pathname);
      if (served) {
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/api/products') {
      const { rows } = await pool.query('SELECT * FROM products ORDER BY name');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && pathname === '/api/stock-movements') {
      const { rows } = await pool.query('SELECT * FROM stock_movements ORDER BY "createdAt" DESC LIMIT 50');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && pathname === '/api/receiving-history') {
      const { rows } = await pool.query('SELECT * FROM receiving_history ORDER BY date DESC LIMIT 20');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && pathname === '/api/service-transactions') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { rows } = await pool.query('SELECT * FROM service_transactions ORDER BY "createdAt" DESC LIMIT 50');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'POST' && pathname === '/api/service-transactions') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req);
      const validation = validateServiceTransactionPayload(body);
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }

      const now = new Date().toISOString();
      const result = await pool.query(
        'INSERT INTO service_transactions ("serviceType", beneficiary, "phoneNumber", amount, reference, "createdAt", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [
          String(body.serviceType || '').trim().toLowerCase(),
          String(body.beneficiary || '').trim(),
          String(body.phoneNumber || '').trim(),
          Number(body.amount) || 0,
          String(body.reference || '').trim() || `svc-${Date.now()}`,
          now,
          user.username || 'Unknown',
        ]
      );
      return sendJson(res, 201, { id: result.rows[0].id, ...body, createdAt: now, createdBy: user.username || 'Unknown' });
    }

    if (req.method === 'GET' && pathname === '/api/media-vault/accounts') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const { rows } = await pool.query(
        'SELECT id, platform, "accountLabel", "platformAccountId", "permissionsJson", "linkStatus", "lastSyncAt", "createdAt", "createdBy", "tokenUpdatedAt" FROM social_accounts ORDER BY "createdAt" DESC'
      );

      const accounts = rows.map((entry) => ({
        ...entry,
        permissions: JSON.parse(entry.permissionsJson || '[]'),
      }));

      return sendJson(res, 200, accounts);
    }

    if (req.method === 'POST' && pathname === '/api/media-vault/accounts/link-init') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const body = await readJsonBody(req);
      const validation = validateSocialAccountLinkInitPayload(body);
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }

      const { platform, accountLabel, permissions } = validation.value;
      const createdAt = new Date().toISOString();
      const simulatedState = crypto.randomBytes(10).toString('hex');
      const providerConfig = OAUTH_PROVIDER_CONFIG[platform];
      const hasProviderOAuthConfig = Boolean(
        providerConfig?.clientId && providerConfig?.authorizeUrl && providerConfig?.tokenUrl && providerConfig?.redirectUri
      );

      let authorizationUrl = `https://example.com/oauth/${platform}?state=${simulatedState}`;
      if (hasProviderOAuthConfig) {
        const query = new URLSearchParams({
          client_id: providerConfig.clientId,
          redirect_uri: providerConfig.redirectUri,
          response_type: 'code',
          state: simulatedState,
          scope: providerConfig.scope,
        });
        authorizationUrl = `${providerConfig.authorizeUrl}?${query.toString()}`;
      }

      const result = await pool.query(
        'INSERT INTO social_accounts (platform, "accountLabel", "platformAccountId", "permissionsJson", "linkStatus", "createdAt", "createdBy", "oauthState") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [
          platform,
          accountLabel,
          null,
          JSON.stringify(permissions),
          'pending',
          createdAt,
          user.username || 'Unknown',
          simulatedState,
        ]
      );

      const accountId = result.rows[0].id;
      return sendJson(res, 201, {
        accountId,
        platform,
        accountLabel,
        linkStatus: 'pending',
        permissions,
        oauthState: simulatedState,
        authorizationUrl,
        oauthConfigured: hasProviderOAuthConfig,
        note: hasProviderOAuthConfig
          ? 'Use authorizationUrl to obtain code, then submit it in link-complete.'
          : 'OAuth env vars are missing; using placeholder URL until provider config is set.',
      });
    }

    if (req.method === 'POST' && pathname === '/api/media-vault/accounts/link-complete') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const body = await readJsonBody(req);
      const validation = validateSocialAccountLinkCompletePayload(body);
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }

      const { accountId, platformAccountId: fallbackPlatformAccountId, oauthState, authorizationCode } = validation.value;

      const lookup = await pool.query('SELECT id, platform, "oauthState" FROM social_accounts WHERE id = $1', [accountId]);
      const account = lookup.rows[0];
      if (!account) {
        return sendJson(res, 404, { error: 'Linked account not found' });
      }

      if (!oauthState || oauthState !== account.oauthState) {
        return sendJson(res, 400, { error: 'Invalid OAuth state' });
      }

      const providerConfig = OAUTH_PROVIDER_CONFIG[account.platform];
      let platformAccountId = fallbackPlatformAccountId;
      let encryptedAccessToken = null;
      let encryptedRefreshToken = null;
      let tokenExpiresAt = null;
      let oauthStatus = 'simulated';

      if (authorizationCode && providerConfig?.clientId && providerConfig?.clientSecret && providerConfig?.tokenUrl && providerConfig?.redirectUri) {
        try {
          const tokenData = await exchangeAuthorizationCodeForToken({
            tokenUrl: providerConfig.tokenUrl,
            clientId: providerConfig.clientId,
            clientSecret: providerConfig.clientSecret,
            redirectUri: providerConfig.redirectUri,
            authorizationCode,
          });

          if (tokenData?.access_token) {
            encryptedAccessToken = encryptValue(tokenData.access_token, TOKEN_ENCRYPTION_SECRET);
            const refreshTokenValue = tokenData.refresh_token || '';
            encryptedRefreshToken = refreshTokenValue ? encryptValue(refreshTokenValue, TOKEN_ENCRYPTION_SECRET) : null;
            const expiresIn = Number(tokenData.expires_in || 0);
            tokenExpiresAt = expiresIn > 0 ? new Date(Date.now() + (expiresIn * 1000)).toISOString() : null;
            platformAccountId = platformAccountId || String(tokenData.open_id || tokenData.user_id || tokenData.id || '').trim();
            oauthStatus = 'configured';
          }
        } catch (tokenExchangeError) {
          return sendJson(res, 400, { error: `Token exchange failed: ${tokenExchangeError.message}` });
        }
      }

      if (!platformAccountId) {
        platformAccountId = `acct-${account.platform}-${accountId}`;
      }

      const now = new Date().toISOString();
      await pool.query(
        'UPDATE social_accounts SET "platformAccountId" = $1, "linkStatus" = $2, "linkedAt" = $3, "updatedAt" = $4, "encryptedAccessToken" = $5, "encryptedRefreshToken" = $6, "tokenExpiresAt" = $7, "tokenUpdatedAt" = $8 WHERE id = $9',
        [platformAccountId, 'linked', now, now, encryptedAccessToken, encryptedRefreshToken, tokenExpiresAt, now, accountId]
      );

      return sendJson(res, 200, {
        accountId,
        platformAccountId,
        linkStatus: 'linked',
        linkedAt: now,
        oauthStatus,
      });
    }

    if (req.method === 'POST' && pathname === '/api/media-vault/import-jobs') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const body = await readJsonBody(req);
      const validation = validateMediaImportRequestPayload(body);
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }

      const { accountId, mediaType, sinceDate, untilDate, maxItems } = validation.value;
      const accountLookup = await pool.query('SELECT id, platform, "accountLabel", "platformAccountId", "linkStatus", "encryptedAccessToken", "encryptedRefreshToken", "tokenExpiresAt" FROM social_accounts WHERE id = $1', [accountId]);
      const account = accountLookup.rows[0];
      if (!account) {
        return sendJson(res, 404, { error: 'Linked account not found' });
      }

      if (account.linkStatus !== 'linked') {
        return sendJson(res, 400, { error: 'Account must be linked before importing media' });
      }

      const createdAt = new Date().toISOString();
      const filters = { mediaType, sinceDate, untilDate, maxItems };
      const jobInsert = await pool.query(
        'INSERT INTO media_import_jobs ("socialAccountId", filters, status, "createdAt", "createdBy") VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [accountId, JSON.stringify(filters), 'running', createdAt, user.username || 'Unknown']
      );

      const jobId = jobInsert.rows[0].id;
      let importedAssets = [];
      let importMode = 'simulated';
      let providerErrorMessage = null;
      try {
        importedAssets = await importAuthorizedMediaFromProvider({
          account,
          filters,
        });
        if (importedAssets.length > 0) {
          importMode = 'provider';
        }
      } catch (providerError) {
        providerErrorMessage = providerError?.message || 'Provider import unavailable';
        importedAssets = [];
      }

      if (importedAssets.length === 0) {
        importedAssets = buildSimulatedAuthorizedAssets({ account, mediaType, sinceDate, untilDate, maxItems });
      }

      for (const asset of importedAssets) {
        await pool.query(
          'INSERT INTO media_assets ("socialAccountId", "importJobId", "platformMediaId", "mediaType", "sourceUrl", "thumbnailUrl", "caption", "postedAt", "downloadPath", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
          [
            accountId,
            jobId,
            asset.platformMediaId,
            asset.mediaType,
            asset.sourceUrl,
            asset.thumbnailUrl,
            asset.caption,
            asset.postedAt,
            asset.downloadPath,
            createdAt,
          ]
        );
      }

      await pool.query(
        'UPDATE media_import_jobs SET status = $1, "completedAt" = $2, "itemCount" = $3, "importMode" = $4, "errorMessage" = $5 WHERE id = $6',
        ['completed', new Date().toISOString(), importedAssets.length, importMode, providerErrorMessage, jobId]
      );

      await pool.query('UPDATE social_accounts SET "lastSyncAt" = $1, "updatedAt" = $2 WHERE id = $3', [new Date().toISOString(), new Date().toISOString(), accountId]);

      return sendJson(res, 201, {
        jobId,
        status: 'completed',
        importedItems: importedAssets.length,
        importMode,
        errorMessage: providerErrorMessage,
        account: {
          id: account.id,
          platform: account.platform,
          accountLabel: account.accountLabel,
        },
      });
    }

    if (req.method === 'GET' && pathname === '/api/media-vault/env-check') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const platformStatus = ['tiktok', 'facebook'].map((platform) => {
        const config = OAUTH_PROVIDER_CONFIG[platform] || {};
        const checks = {
          clientId: Boolean(config.clientId),
          clientSecret: Boolean(config.clientSecret),
          authorizeUrl: Boolean(config.authorizeUrl),
          tokenUrl: Boolean(config.tokenUrl),
          redirectUri: Boolean(config.redirectUri),
          mediaListUrl: Boolean(config.mediaListUrl),
        };
        const readyForOauth = checks.clientId && checks.clientSecret && checks.authorizeUrl && checks.tokenUrl && checks.redirectUri;
        const readyForImport = readyForOauth && checks.mediaListUrl;

        return {
          platform,
          checks,
          readyForOauth,
          readyForImport,
        };
      });

      return sendJson(res, 200, {
        checkedAt: new Date().toISOString(),
        tokenEncryptionSecretConfigured: TOKEN_ENCRYPTION_SECRET !== 'dev-token-encryption-secret-change-me-32-bytes-min',
        platforms: platformStatus,
      });
    }

    if (req.method === 'POST' && pathname === '/api/media-vault/test-connection') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const body = await readJsonBody(req);
      const accountId = Number(body?.accountId);
      if (!Number.isInteger(accountId) || accountId <= 0) {
        return sendJson(res, 400, { error: 'Valid accountId is required' });
      }

      const lookup = await pool.query('SELECT id, platform, "accountLabel", "platformAccountId", "linkStatus", "encryptedAccessToken", "encryptedRefreshToken", "tokenExpiresAt" FROM social_accounts WHERE id = $1', [accountId]);
      const account = lookup.rows[0];
      if (!account) {
        return sendJson(res, 404, { error: 'Linked account not found' });
      }
      if (account.linkStatus !== 'linked') {
        return sendJson(res, 400, { error: 'Account must be linked first' });
      }

      const providerConfig = OAUTH_PROVIDER_CONFIG[account.platform] || {};
      const hasProviderImportConfig = Boolean(providerConfig.mediaListUrl && providerConfig.tokenUrl && providerConfig.clientId);

      if (!hasProviderImportConfig) {
        return sendJson(res, 200, {
          accountId,
          platform: account.platform,
          ok: false,
          mode: 'simulated',
          message: 'Provider media import configuration is incomplete for this platform.',
        });
      }

      try {
        const assets = await importAuthorizedMediaFromProvider({
          account,
          filters: { mediaType: 'all', sinceDate: '', untilDate: '', maxItems: 1 },
        });

        if (!assets.length) {
          return sendJson(res, 200, {
            accountId,
            platform: account.platform,
            ok: false,
            mode: 'provider',
            message: 'Provider request succeeded but returned no assets for probe query.',
          });
        }

        return sendJson(res, 200, {
          accountId,
          platform: account.platform,
          ok: true,
          mode: 'provider',
          message: 'Provider connection is healthy.',
          sample: {
            platformMediaId: assets[0].platformMediaId,
            mediaType: assets[0].mediaType,
          },
        });
      } catch (error) {
        return sendJson(res, 200, {
          accountId,
          platform: account.platform,
          ok: false,
          mode: 'provider',
          message: error?.message || 'Unable to verify provider connection.',
        });
      }
    }

    if (req.method === 'GET' && pathname === '/api/media-vault/import-jobs') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const { rows } = await pool.query(
        'SELECT mij.id, mij."socialAccountId", mij.filters, mij.status, mij."itemCount", mij."createdAt", mij."completedAt", mij."createdBy", mij."importMode", mij."errorMessage", sa.platform, sa."accountLabel" FROM media_import_jobs mij JOIN social_accounts sa ON sa.id = mij."socialAccountId" ORDER BY mij."createdAt" DESC LIMIT 60'
      );

      const jobs = rows.map((row) => ({
        ...row,
        filters: JSON.parse(row.filters || '{}'),
      }));

      return sendJson(res, 200, jobs);
    }

    if (req.method === 'GET' && pathname === '/api/media-vault/assets') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const accountId = Number(searchParams.get('accountId'));
      const mediaType = String(searchParams.get('mediaType') || 'all').trim().toLowerCase();
      const limit = Math.min(250, Math.max(1, Number(searchParams.get('limit') || 100)));

      const queryParts = ['SELECT ma.*, sa.platform, sa."accountLabel" FROM media_assets ma JOIN social_accounts sa ON sa.id = ma."socialAccountId"'];
      const values = [];
      const where = [];

      if (Number.isInteger(accountId) && accountId > 0) {
        values.push(accountId);
        where.push(`ma."socialAccountId" = $${values.length}`);
      }

      if (mediaType !== 'all') {
        values.push(mediaType);
        where.push(`ma."mediaType" = $${values.length}`);
      }

      if (where.length > 0) {
        queryParts.push(`WHERE ${where.join(' AND ')}`);
      }

      values.push(limit);
      queryParts.push(`ORDER BY ma."postedAt" DESC LIMIT $${values.length}`);

      const { rows } = await pool.query(queryParts.join(' '), values);
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && pathname === '/api/media-vault/export') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });

      const { rows } = await pool.query(
        'SELECT ma.id, ma."mediaType", ma."sourceUrl", ma.caption, ma."postedAt", ma."downloadPath", sa.platform, sa."accountLabel" FROM media_assets ma JOIN social_accounts sa ON sa.id = ma."socialAccountId" ORDER BY ma."postedAt" DESC LIMIT 500'
      );

      return sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        exportedBy: user.username || 'Unknown',
        itemCount: rows.length,
        items: rows,
      });
    }

    if (req.method === 'GET' && pathname === '/api/purchase-orders') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const { rows } = await pool.query('SELECT * FROM purchase_orders ORDER BY "createdAt" DESC');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/purchase-orders/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      const body = await readJsonBody(req);
      const { status } = body;
      const nextStatus = status === 'approved' || status === 'completed' ? status : 'pending';
      const result = await pool.query('UPDATE purchase_orders SET status = $1, "updatedAt" = $2 WHERE id = $3', [nextStatus, new Date().toISOString(), id]);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'Purchase order not found' });
      }
      const updatedOrder = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
      return sendJson(res, 200, updatedOrder.rows[0]);
    }

    if (req.method === 'POST' && pathname === '/api/purchase-orders') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const body = await readJsonBody(req);
      const { supplier, storeAccount, date, items, totalAmount } = body;
      const validation = validatePurchaseOrderPayload({ supplier, items });
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const now = new Date().toISOString();
      const result = await pool.query(
        'INSERT INTO purchase_orders (supplier, "storeAccount", date, "itemsJson", "totalAmount", "createdAt", "updatedAt", status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [supplier || 'Supplier not specified', storeAccount || 'Main Store', date || now, JSON.stringify(items), Number(totalAmount) || 0, now, now, 'pending']
      );
      return sendJson(res, 201, { id: result.rows[0].id, supplier, storeAccount, date, totalAmount: Number(totalAmount) || 0, items, createdAt: now, updatedAt: now, itemsJson: JSON.stringify(items), status: 'pending' });
    }

    if (req.method === 'POST' && pathname === '/api/receiving-history') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const body = await readJsonBody(req);
      const { supplier, storeAccount, date, items, totalAmount, purchaseOrderId } = body;
      const validation = validateReceivingPayload({ supplier, items });
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const result = await pool.query(
        'INSERT INTO receiving_history (supplier, "storeAccount", date, "itemsJson", "totalAmount", "purchaseOrderId") VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [supplier || 'Supplier not specified', storeAccount || 'Main Store', date || new Date().toISOString(), JSON.stringify(items), Number(totalAmount) || 0, purchaseOrderId || null]
      );
      for (const item of items) {
        await pool.query(
          'INSERT INTO stock_movements ("productId", "productName", "movementType", quantity, "createdAt", note) VALUES ($1, $2, $3, $4, $5, $6)',
          [0, item.name, 'receiving', Math.abs(Number(item.quantity) || 0), new Date().toISOString(), `Received from ${supplier || 'supplier'}`]
        );
      }
      return sendJson(res, 201, { id: result.rows[0].id, supplier, storeAccount, date, totalAmount: Number(totalAmount) || 0, items });
    }

    if (req.method === 'POST' && pathname === '/api/products') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const body = await readJsonBody(req);
      const { sku, name, price, stock, costPrice } = body;
      const validation = validateProductPayload({ sku, name, price, costPrice, stock });
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const result = await pool.query(
        'INSERT INTO products (sku, name, price, "costPrice", stock) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [sku, name, price, Number(costPrice) || 0, stock]
      );
      return sendJson(res, 201, { id: result.rows[0].id, sku, name, price, costPrice: Number(costPrice) || 0, stock });
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const { rows } = await pool.query('SELECT id, username, "fullName", role FROM users ORDER BY username');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'POST' && pathname === '/api/users') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const body = await readJsonBody(req);
      const { fullName, username, password, role } = body;
      if (!username || !password) {
        return sendJson(res, 400, { error: 'Username and password are required' });
      }
      const userRole = role === 'admin' ? 'admin' : 'cashier';
      const safeFullName = (fullName || '').trim() || username;
      const hashedPassword = hashPassword(password);
      const result = await pool.query('INSERT INTO users (username, password, role, "fullName") VALUES ($1, $2, $3, $4) RETURNING id', [username, hashedPassword, userRole, safeFullName]);
      return sendJson(res, 201, { id: result.rows[0].id, username, fullName: safeFullName, role: userRole });
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/users/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      const body = await readJsonBody(req);
      const { fullName, username, password, role } = body;
      if (!username) {
        return sendJson(res, 400, { error: 'Username is required' });
      }
      const userRole = role === 'admin' ? 'admin' : 'cashier';
      const safeFullName = (fullName || '').trim() || username;
      const updates = [];
      const values = [];
      let idx = 1;
      updates.push(`username = $${idx++}`); values.push(username);
      updates.push(`role = $${idx++}`); values.push(userRole);
      updates.push(`"fullName" = $${idx++}`); values.push(safeFullName);
      if (password) {
        updates.push(`password = $${idx++}`); values.push(hashPassword(password));
      }
      values.push(id);
      const result = await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      return sendJson(res, 200, { id: Number(id), username, fullName: safeFullName, role: userRole });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/users/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      await pool.query('DELETE FROM refresh_tokens WHERE "userId" = $1', [id]);
      const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      return sendJson(res, 204, null);
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readJsonBody(req);
      const { username, password } = body;
      const { rows } = await pool.query('SELECT id, username, password, role FROM users WHERE username = $1', [username]);
      const user = rows[0];
      if (!user || !verifyPassword(password, user.password)) {
        return sendJson(res, 401, { error: 'Invalid username or password' });
      }
      const token = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '15m');
      const refreshToken = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '7d');
      await saveRefreshToken(refreshToken, user.id);
      return sendJson(res, 200, { id: user.id, username: user.username, role: user.role, token, refreshToken });
    }

    if (req.method === 'POST' && pathname === '/api/refresh') {
      const body = await readJsonBody(req);
      const { refreshToken } = body;
      if (!refreshToken) {
        return sendJson(res, 400, { error: 'Refresh token required' });
      }
      const storedToken = await findValidRefreshToken(refreshToken);
      if (!storedToken) {
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      const payload = verifyToken(refreshToken, JWT_SECRET);
      if (!payload) {
        await deleteRefreshToken(refreshToken);
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      const { rows } = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [payload.id]);
      const user = rows[0];
      if (!user) {
        await deleteRefreshToken(refreshToken);
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      await deleteRefreshToken(refreshToken);
      const token = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '15m');
      const newRefreshToken = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '7d');
      await saveRefreshToken(newRefreshToken, user.id);
      return sendJson(res, 200, { token, refreshToken: newRefreshToken });
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
      const body = await readJsonBody(req);
      const { refreshToken } = body;
      if (refreshToken) {
        await deleteRefreshToken(refreshToken);
      }
      return sendJson(res, 204, null);
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/products/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      const body = await readJsonBody(req);
      const { sku, name, price, stock, costPrice } = body;
      const validation = validateProductPayload({ sku, name, price, costPrice, stock });
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const result = await pool.query('UPDATE products SET sku = $1, name = $2, price = $3, "costPrice" = $4, stock = $5 WHERE id = $6', [sku, name, price, Number(costPrice) || 0, stock, id]);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'Product not found' });
      }
      return sendJson(res, 200, { id: Number(id), sku, name, price, costPrice: Number(costPrice) || 0, stock });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/products/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      await pool.query('DELETE FROM sale_items WHERE "productId" = $1', [id]);
      const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'Product not found' });
      }
      return sendJson(res, 204, null);
    }

    if (req.method === 'POST' && pathname === '/api/sales') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req);
      const { items, paymentMethod, discountType = 'none', discountValue = '0' } = body;
      const productRowsResult = await pool.query('SELECT id, stock FROM products');
      const validation = validateSalePayload({ items, paymentMethod, discountType, discountValue }, productRowsResult.rows);
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
      const parsedDiscountValue = Number(discountValue) || 0;
      let discountAmount = 0;
      if (discountType === 'amount') {
        discountAmount = Math.max(0, parsedDiscountValue);
      } else if (discountType === 'percent') {
        discountAmount = Math.max(0, subtotal * (parsedDiscountValue / 100));
      }
      const total = Math.max(0, subtotal - discountAmount);
      const costTotal = items.reduce((sum, item) => sum + (Number(item.costPrice) || 0) * item.quantity, 0);
      const profit = total - costTotal;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const saleResult = await client.query(
          'INSERT INTO sales (datetime, total, profit, "paymentMethod", "cashierName") VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [new Date().toISOString(), total, profit, paymentMethod, user.username || 'Unknown']
        );
        const saleId = saleResult.rows[0].id;
        for (const item of items) {
          await client.query(
            'INSERT INTO sale_items ("saleId", "productId", quantity, price, "costPrice") VALUES ($1, $2, $3, $4, $5)',
            [saleId, item.productId, item.quantity, item.price, Number(item.costPrice) || 0]
          );
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.productId]);
          await client.query(
            'INSERT INTO stock_movements ("productId", "productName", "movementType", quantity, "createdAt", note) VALUES ($1, $2, $3, $4, $5, $6)',
            [item.productId, item.name, 'sale', -Math.abs(Number(item.quantity) || 0), new Date().toISOString(), `Sale #${saleId}`]
          );
        }
        await client.query('COMMIT');
        return sendJson(res, 201, { saleId, subtotal, discountAmount, total, profit, paymentMethod, items });
      } catch (error) {
        await client.query('ROLLBACK');
        return sendJson(res, 400, { error: error.message });
      } finally {
        client.release();
      }
    }

    if (req.method === 'GET' && pathname === '/api/reports/sales') {
      const salesResult = await pool.query('SELECT * FROM sales ORDER BY datetime DESC');
      const salesWithItems = await Promise.all(salesResult.rows.map(async (sale) => {
        const itemsResult = await pool.query(
          'SELECT si.*, p.name, p.sku, CASE WHEN si."costPrice" IS NOT NULL AND si."costPrice" <> 0 THEN si."costPrice" ELSE p."costPrice" END AS "costPrice" FROM sale_items si JOIN products p ON si."productId" = p.id WHERE si."saleId" = $1',
          [sale.id]
        );
        const items = itemsResult.rows;
        const calculatedProfit = items.reduce((sum, item) => {
          const unitProfit = (Number(item.price) || 0) - (Number(item.costPrice) || 0);
          return sum + unitProfit * (Number(item.quantity) || 0);
        }, 0);
        return { ...sale, profit: Number(calculatedProfit) || 0, items };
      }));
      return sendJson(res, 200, salesWithItems);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

async function initDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    "fullName" TEXT NOT NULL DEFAULT ''
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    datetime TEXT NOT NULL,
    total DOUBLE PRECISION NOT NULL,
    profit DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "cashierName" TEXT NOT NULL DEFAULT 'Unknown'
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    "saleId" INTEGER NOT NULL REFERENCES sales(id),
    "productId" INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    "userId" INTEGER NOT NULL REFERENCES users(id),
    "expiresAt" TEXT NOT NULL
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    "productId" INTEGER NOT NULL DEFAULT 0,
    "productName" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS receiving_history (
    id SERIAL PRIMARY KEY,
    supplier TEXT NOT NULL DEFAULT 'Supplier not specified',
    "storeAccount" TEXT NOT NULL DEFAULT 'Main Store',
    date TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseOrderId" INTEGER
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    supplier TEXT NOT NULL DEFAULT 'Supplier not specified',
    "storeAccount" TEXT NOT NULL DEFAULT 'Main Store',
    date TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS service_transactions (
    id SERIAL PRIMARY KEY,
    "serviceType" TEXT NOT NULL,
    beneficiary TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    reference TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'Unknown'
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS social_accounts (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "platformAccountId" TEXT,
    "permissionsJson" TEXT NOT NULL DEFAULT '[]',
    "linkStatus" TEXT NOT NULL DEFAULT 'pending',
    "oauthState" TEXT NOT NULL DEFAULT '',
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TEXT,
    "tokenUpdatedAt" TEXT,
    "linkedAt" TEXT,
    "lastSyncAt" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'Unknown'
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS media_import_jobs (
    id SERIAL PRIMARY KEY,
    "socialAccountId" INTEGER NOT NULL REFERENCES social_accounts(id),
    filters TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "importMode" TEXT NOT NULL DEFAULT 'simulated',
    "errorMessage" TEXT,
    "createdAt" TEXT NOT NULL,
    "completedAt" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'Unknown'
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS media_assets (
    id SERIAL PRIMARY KEY,
    "socialAccountId" INTEGER NOT NULL REFERENCES social_accounts(id),
    "importJobId" INTEGER NOT NULL REFERENCES media_import_jobs(id),
    "platformMediaId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    caption TEXT NOT NULL DEFAULT '',
    "postedAt" TEXT NOT NULL,
    "downloadPath" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL
  )`);

  await pool.query('DELETE FROM refresh_tokens WHERE "expiresAt" < $1', [new Date().toISOString()]);

  await ensureDefaultUsers(pool);
  await ensureStarterProducts(pool);
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, storedValue) {
  if (!storedValue) {
    return false;
  }

  if (storedValue.startsWith('$2a$') || storedValue.startsWith('$2b$') || storedValue.startsWith('$2y$')) {
    return bcrypt.compareSync(password, storedValue);
  }

  const [salt, hash] = storedValue.split(':');
  if (!salt || !hash) {
    return false;
  }

  try {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

async function saveRefreshToken(token, userId) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await pool.query('INSERT INTO refresh_tokens (token, "userId", "expiresAt") VALUES ($1, $2, $3)', [token, userId, expiresAt]);
}

async function deleteRefreshToken(token) {
  await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
}

async function findValidRefreshToken(token) {
  const { rows } = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1', [token]);
  const tokenRow = rows[0];
  if (!tokenRow) {
    return null;
  }
  if (new Date(tokenRow.expiresAt) < new Date()) {
    await deleteRefreshToken(token);
    return null;
  }
  return tokenRow;
}

function signToken(payload, secret, expiresIn) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + (expiresIn === '15m' ? 15 * 60 : 7 * 24 * 60 * 60);
  const body = base64Url(JSON.stringify({ ...payload, exp }));
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [header, payload, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  if (expectedSignature !== signature) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildSimulatedAuthorizedAssets({ account, mediaType, sinceDate, untilDate, maxItems }) {
  const totalCount = Math.min(maxItems, 6);
  const mediaPool = mediaType === 'all'
    ? ['video', 'photo', 'reel']
    : [mediaType];

  const since = sinceDate && !Number.isNaN(new Date(sinceDate).getTime()) ? new Date(sinceDate).getTime() : Date.now() - (14 * 24 * 60 * 60 * 1000);
  const until = untilDate && !Number.isNaN(new Date(untilDate).getTime()) ? new Date(untilDate).getTime() : Date.now();
  const timeWindow = Math.max(1, until - since);

  return Array.from({ length: totalCount }).map((_, index) => {
    const selectedType = mediaPool[index % mediaPool.length];
    const postedAt = new Date(until - Math.floor((timeWindow / Math.max(1, totalCount)) * index)).toISOString();
    const safeLabel = String(account.accountLabel || 'account').replace(/\s+/g, '-').toLowerCase();
    const platformMediaId = `${account.platform}-${safeLabel}-${Date.now()}-${index + 1}`;

    return {
      platformMediaId,
      mediaType: selectedType,
      sourceUrl: `https://media.example.com/${account.platform}/${platformMediaId}`,
      thumbnailUrl: `https://media.example.com/${account.platform}/${platformMediaId}/thumb.jpg`,
      caption: `Authorized backup for ${account.accountLabel} (${selectedType})`,
      postedAt,
      downloadPath: `/exports/${account.platform}/${safeLabel}/${platformMediaId}.${selectedType === 'photo' ? 'jpg' : 'mp4'}`,
    };
  });
}

function encryptValue(plainText, secret) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(String(secret || '')).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encryptedBuffer = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encryptedBuffer.toString('hex')].join('.');
}

function decryptValue(encryptedValue, secret) {
  if (!encryptedValue) {
    return '';
  }
  const [ivHex, tagHex, encryptedHex] = String(encryptedValue).split('.');
  if (!ivHex || !tagHex || !encryptedHex) {
    return '';
  }
  const key = crypto.createHash('sha256').update(String(secret || '')).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

async function exchangeAuthorizationCodeForToken({ tokenUrl, clientId, clientSecret, redirectUri, authorizationCode }) {
  if (!tokenUrl) {
    throw new Error('Token URL is not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  let tokenData = {};
  try {
    tokenData = await response.json();
  } catch {
    tokenData = {};
  }

  if (!response.ok) {
    const providerMessage = tokenData?.error_description || tokenData?.error?.message || tokenData?.error || 'Provider rejected authorization code';
    throw new Error(providerMessage);
  }

  return tokenData;
}

async function refreshProviderAccessToken({ account, providerConfig }) {
  if (!providerConfig?.tokenUrl || !providerConfig?.clientId || !providerConfig?.clientSecret) {
    return null;
  }

  const encryptedRefreshToken = account?.encryptedRefreshToken || '';
  const refreshToken = decryptValue(encryptedRefreshToken, TOKEN_ENCRYPTION_SECRET);
  if (!refreshToken) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: providerConfig.clientId,
    client_secret: providerConfig.clientSecret,
  });

  const response = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  let tokenData = {};
  try {
    tokenData = await response.json();
  } catch {
    tokenData = {};
  }

  if (!response.ok || !tokenData?.access_token) {
    return null;
  }

  const encryptedAccessToken = encryptValue(tokenData.access_token, TOKEN_ENCRYPTION_SECRET);
  const nextRefreshToken = tokenData.refresh_token || refreshToken;
  const encryptedRefreshTokenNext = nextRefreshToken
    ? encryptValue(nextRefreshToken, TOKEN_ENCRYPTION_SECRET)
    : account?.encryptedRefreshToken || null;
  const expiresIn = Number(tokenData.expires_in || 0);
  const tokenExpiresAt = expiresIn > 0 ? new Date(Date.now() + (expiresIn * 1000)).toISOString() : null;
  const now = new Date().toISOString();

  await pool.query(
    'UPDATE social_accounts SET "encryptedAccessToken" = $1, "encryptedRefreshToken" = $2, "tokenExpiresAt" = $3, "tokenUpdatedAt" = $4, "updatedAt" = $5 WHERE id = $6',
    [encryptedAccessToken, encryptedRefreshTokenNext, tokenExpiresAt, now, now, account.id]
  );

  return {
    accessToken: tokenData.access_token,
    tokenExpiresAt,
  };
}

async function getProviderAccessToken(account) {
  if (!account?.encryptedAccessToken) {
    return null;
  }

  let accessToken = '';
  try {
    accessToken = decryptValue(account.encryptedAccessToken, TOKEN_ENCRYPTION_SECRET);
  } catch {
    return null;
  }
  if (!accessToken) {
    return null;
  }

  const providerConfig = OAUTH_PROVIDER_CONFIG[account.platform];
  const expiresAtMs = account?.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  const refreshBeforeMs = Date.now() + (TOKEN_REFRESH_LEEWAY_SECONDS * 1000);
  if (expiresAtMs && expiresAtMs <= refreshBeforeMs) {
    const refreshed = await refreshProviderAccessToken({ account, providerConfig });
    if (refreshed?.accessToken) {
      return refreshed.accessToken;
    }
  }

  return accessToken;
}

function normalizeIsoDate(value) {
  if (value === null || value === undefined || value === '') {
    return new Date().toISOString();
  }

  const raw = String(value).trim();
  if (!raw) {
    return new Date().toISOString();
  }

  if (/^\d+$/.test(raw)) {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      const millis = raw.length <= 10 ? asNumber * 1000 : asNumber;
      const asDate = new Date(millis);
      if (!Number.isNaN(asDate.getTime())) {
        return asDate.toISOString();
      }
    }
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function normalizeMediaType(platform, rawType) {
  const type = String(rawType || '').toLowerCase();
  if (!type) {
    return 'video';
  }

  if (platform === 'facebook') {
    if (type.includes('image') || type.includes('photo')) {
      return 'photo';
    }
    if (type.includes('reel')) {
      return 'reel';
    }
    return 'video';
  }

  if (platform === 'tiktok') {
    if (type.includes('image') || type.includes('photo')) {
      return 'photo';
    }
    return 'video';
  }

  if (type.includes('image') || type.includes('photo')) {
    return 'photo';
  }
  if (type.includes('reel')) {
    return 'reel';
  }
  return 'video';
}

function safeAccountLabel(account) {
  return String(account?.accountLabel || 'account').replace(/\s+/g, '-').toLowerCase();
}

function mapTikTokAsset(item, account, index) {
  const mediaId = String(
    item?.id ||
    item?.video_id ||
    item?.item_id ||
    `tiktok-${Date.now()}-${index + 1}`
  );

  const rawType = item?.media_type || item?.type || (item?.is_image ? 'photo' : 'video');
  const mediaType = normalizeMediaType('tiktok', rawType);
  const sourceUrl =
    item?.download_url ||
    item?.play_url ||
    item?.share_url ||
    item?.media_url ||
    item?.permalink ||
    '';
  const thumbnailUrl = item?.cover_image_url || item?.cover_url || item?.thumbnail_url || '';
  const caption = item?.title || item?.caption || item?.description || '';
  const postedAt = normalizeIsoDate(item?.create_time || item?.create_timestamp || item?.timestamp);
  const safeLabel = safeAccountLabel(account);

  return {
    platformMediaId: mediaId,
    mediaType,
    sourceUrl: sourceUrl || `https://media.example.com/tiktok/${mediaId}`,
    thumbnailUrl,
    caption,
    postedAt,
    downloadPath: `/exports/tiktok/${safeLabel}/${mediaId}.${mediaType === 'photo' ? 'jpg' : 'mp4'}`,
  };
}

function mapFacebookAsset(item, account, index) {
  const mediaId = String(item?.id || item?.media_id || `facebook-${Date.now()}-${index + 1}`);
  const rawType = item?.media_type || item?.type || item?.post_type || '';
  const mediaType = normalizeMediaType('facebook', rawType);
  const sourceUrl =
    item?.media_url ||
    item?.source ||
    item?.permalink_url ||
    item?.permalink ||
    item?.url ||
    '';
  const thumbnailUrl = item?.thumbnail_url || item?.picture || '';
  const caption = item?.caption || item?.message || item?.description || '';
  const postedAt = normalizeIsoDate(item?.timestamp || item?.created_time);
  const safeLabel = safeAccountLabel(account);

  return {
    platformMediaId: mediaId,
    mediaType,
    sourceUrl: sourceUrl || `https://media.example.com/facebook/${mediaId}`,
    thumbnailUrl,
    caption,
    postedAt,
    downloadPath: `/exports/facebook/${safeLabel}/${mediaId}.${mediaType === 'photo' ? 'jpg' : 'mp4'}`,
  };
}

function extractProviderItems(platform, payload) {
  if (platform === 'tiktok') {
    if (Array.isArray(payload?.data?.videos)) return payload.data.videos;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.videos)) return payload.videos;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  if (platform === 'facebook') {
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.posts?.data)) return payload.posts.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeProviderMediaAssets(platform, account, items) {
  const list = Array.isArray(items) ? items : [];
  if (platform === 'tiktok') {
    return list.map((item, index) => mapTikTokAsset(item, account, index));
  }
  if (platform === 'facebook') {
    return list.map((item, index) => mapFacebookAsset(item, account, index));
  }

  const safeLabel = safeAccountLabel(account);
  return list.map((item, index) => {
    const mediaId = String(item?.id || item?.media_id || `${platform}-${Date.now()}-${index + 1}`);
    const mediaType = normalizeMediaType(platform, item?.media_type || item?.type);
    const sourceUrl = item?.media_url || item?.source_url || item?.url || item?.permalink || '';
    const thumbnailUrl = item?.thumbnail_url || item?.thumb || '';
    const caption = item?.caption || item?.description || '';
    const postedAt = normalizeIsoDate(item?.timestamp || item?.created_time);

    return {
      platformMediaId: mediaId,
      mediaType,
      sourceUrl: sourceUrl || `https://media.example.com/${platform}/${mediaId}`,
      thumbnailUrl,
      caption,
      postedAt,
      downloadPath: `/exports/${platform}/${safeLabel}/${mediaId}.${mediaType === 'photo' ? 'jpg' : 'mp4'}`,
    };
  });
}

function buildProviderMediaListUrl(providerConfig, account, filters) {
  let base = String(providerConfig?.mediaListUrl || '').trim();
  if (!base) {
    return null;
  }

  if (base.includes('{account_id}') && account?.platformAccountId) {
    base = base.replace('{account_id}', encodeURIComponent(String(account.platformAccountId)));
  }

  const url = new URL(base);
  const limit = Math.max(1, Math.min(200, Number(filters?.maxItems) || 20));

  if (account?.platform === 'tiktok') {
    if (!url.searchParams.has('max_count')) {
      url.searchParams.set('max_count', String(limit));
    }
    if (!url.searchParams.has('limit')) {
      url.searchParams.set('limit', String(limit));
    }
    if (filters?.sinceDate) {
      url.searchParams.set('since', filters.sinceDate);
    }
    if (filters?.untilDate) {
      url.searchParams.set('until', filters.untilDate);
    }
    if (filters?.mediaType && filters.mediaType !== 'all') {
      url.searchParams.set('media_type', filters.mediaType);
    }
  } else if (account?.platform === 'facebook') {
    if (!url.searchParams.has('limit')) {
      url.searchParams.set('limit', String(limit));
    }
    if (filters?.sinceDate) {
      url.searchParams.set('since', filters.sinceDate);
    }
    if (filters?.untilDate) {
      url.searchParams.set('until', filters.untilDate);
    }
    if (filters?.mediaType && filters.mediaType !== 'all') {
      url.searchParams.set('media_type', filters.mediaType);
    }
    if (account?.platformAccountId && !base.includes('{account_id}')) {
      url.searchParams.set('account_id', account.platformAccountId);
    }
  } else {
    url.searchParams.set('limit', String(limit));
  }

  return url;
}

async function fetchProviderMediaAssets({ account, filters, accessToken }) {
  const providerConfig = OAUTH_PROVIDER_CONFIG[account.platform];
  if (!providerConfig?.mediaListUrl) {
    return [];
  }

  const url = buildProviderMediaListUrl(providerConfig, account, filters);
  if (!url) {
    return [];
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    const providerMessage = payload?.error?.message || payload?.error_description || payload?.message || `Provider media request failed (${response.status})`;
    throw new Error(providerMessage);
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  const items = extractProviderItems(account.platform, payload);

  return normalizeProviderMediaAssets(account.platform, account, items);
}

async function importAuthorizedMediaFromProvider({ account, filters }) {
  const accessToken = await getProviderAccessToken(account);
  if (!accessToken) {
    throw new Error('No provider access token available for this account');
  }

  return fetchProviderMediaAssets({
    account,
    filters,
    accessToken,
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  if (statusCode === 204) {
    res.writeHead(204, { 'Content-Type': 'application/json' });
    res.end();
    return;
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function requireAuth(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    sendJson(res, 401, { error: 'Authorization token required' });
    return null;
  }
  const user = verifyToken(token);
  if (!user) {
    sendJson(res, 401, { error: 'Invalid or expired token' });
    return null;
  }
  return user;
}

initDatabase()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`POS backend listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });

function tryServeFrontend(req, res, pathname) {
  if (!fs.existsSync(FRONTEND_BUILD_PATH)) {
    return false;
  }

  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const relativePath = normalizedPath.replace(/^\/+/, '');
  const safePath = relativePath || 'index.html';
  const fullPath = path.resolve(FRONTEND_BUILD_PATH, safePath);
  const buildRoot = path.resolve(FRONTEND_BUILD_PATH);

  if (!fullPath.startsWith(buildRoot)) {
    return false;
  }

  const fileExists = fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
  if (fileExists) {
    return sendFile(res, fullPath);
  }

  const indexPath = path.resolve(FRONTEND_BUILD_PATH, 'index.html');
  if (fs.existsSync(indexPath)) {
    return sendFile(res, indexPath);
  }

  return false;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
  }[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
