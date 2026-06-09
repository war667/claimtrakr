FROM node:20-alpine AS builder

ARG VITE_API_URL
ARG VITE_AUTH_USER
ARG VITE_AUTH_PASS
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTH_USER=$VITE_AUTH_USER
ENV VITE_AUTH_PASS=$VITE_AUTH_PASS

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY index.html vite.config.js ./
COPY src/ ./src/

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
