FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3847
ENV HOST=0.0.0.0

RUN mkdir -p /app/data

EXPOSE 3847

CMD ["npm", "start"]
