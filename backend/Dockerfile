FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

VOLUME ["/usr/src/app/data"]

EXPOSE 4000

CMD ["node", "src/index.js"]
