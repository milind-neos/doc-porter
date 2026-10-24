FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npx", "http-server", "-p", "3000", "-a", "0.0.0.0", "-c-1"]
