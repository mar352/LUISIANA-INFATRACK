# Build the Vite React app, then serve via nginx (proxies API + Socket.IO to backend).
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Empty VITE_BACKEND_URL = same-origin (nginx proxies /api and /socket.io).
ARG VITE_MAPBOX_TOKEN=
ARG VITE_BACKEND_URL=
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
