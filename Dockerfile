FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN npm ci

COPY backend backend
COPY frontend frontend

RUN npm run build --workspace frontend

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV FRONTEND_BUILD_PATH=frontend/build

EXPOSE 4000

CMD ["npm", "start"]
