# DMIS frontend — build the Angular app and serve it via nginx (F25).
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM nginx:alpine
# AOT build output (see angular.json outputPath: dist/dmis-web).
COPY --from=build /app/dist/dmis-web/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
