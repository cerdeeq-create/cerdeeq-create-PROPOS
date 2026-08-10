FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm install --production && apk del python3 make g++

COPY . .

VOLUME ["/usr/src/app/data"]

EXPOSE 4000

CMD ["node", "src/index.js"]
