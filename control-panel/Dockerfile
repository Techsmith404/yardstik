FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache bash python3 file curl
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
