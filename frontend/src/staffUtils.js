export const normalizeStaffRole = (value) => {
  if (typeof value !== 'string') {
    return 'cashier';
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'admin' ? 'admin' : 'cashier';
};

export const buildStaffUpdatePayload = (form) => {
  const nextPayload = {
    fullName: (form.fullName || '').trim(),
    username: (form.username || '').trim(),
    role: normalizeStaffRole(form.role),
  };

  if (form.password && form.password.trim()) {
    nextPayload.password = form.password.trim();
  }

  return nextPayload;
};
