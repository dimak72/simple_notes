FROM nginx:stable-alpine-slim

COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/index.html
COPY assets/ /usr/share/nginx/html/assets/

RUN set -eu; \
    styles_version="$(sha256sum /usr/share/nginx/html/assets/styles.css | cut -c 1-12)"; \
    app_version="$(sha256sum /usr/share/nginx/html/assets/app.js | cut -c 1-12)"; \
    sed -i \
      -e "s/__STYLES_VERSION__/${styles_version}/g" \
      -e "s/__APP_VERSION__/${app_version}/g" \
      /usr/share/nginx/html/index.html; \
    rm /etc/nginx/conf.d/default.conf

USER nginx

EXPOSE 8080

ENTRYPOINT ["nginx", "-g", "daemon off;"]
