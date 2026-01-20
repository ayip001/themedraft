FROM node:20-alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
# Install all dependencies including devDependencies for the build step
RUN npm install

COPY . .

RUN npm run build

# Set production environment
ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "docker-start"]
