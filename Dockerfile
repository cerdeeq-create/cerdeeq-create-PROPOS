FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend backend
COPY frontend frontend

RUN npm ci

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV FRONTEND_BUILD_PATH=frontend/build

EXPOSE 4000

CMD ["npm", "start"]
