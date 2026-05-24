FROM nginx:stable-alpine-slim

COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/index.html
COPY assets/ /usr/share/nginx/html/assets/

RUN rm /etc/nginx/conf.d/default.conf

USER nginx

EXPOSE 8080

ENTRYPOINT ["nginx", "-g", "daemon off;"]
