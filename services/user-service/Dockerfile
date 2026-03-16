FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY nest-cli.json tsconfig*.json ./
COPY src ./src
COPY test ./test
COPY migrations ./migrations
COPY .env.example ./

EXPOSE 3000
CMD ["npm", "run", "dev"]
