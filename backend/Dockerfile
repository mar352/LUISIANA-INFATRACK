FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=4000
ENV UPLOADS_DIR=/app/uploads
ENV CLIENT_ORIGIN=http://localhost:8080

RUN mkdir -p /app/uploads

EXPOSE 4000

CMD ["npm", "start"]
