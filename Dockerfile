FROM alpine:3.20

# 1. Install Nginx, lightweight JSON processing (jq), and cron engine
RUN apk add --no-cache \
    nginx \
    jq \
    dcron

# 2. Configure standard Nginx layout
RUN mkdir -p /run/nginx
COPY ./html /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/nginx.conf

# 3. Setup core automation app context
WORKDIR /app

# 4. Inject runtime automation schedules for safety slides manifest
RUN echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" > /etc/crontabs/root \
    && echo "*/5 * * * * ls /usr/share/nginx/html/assets/safety-slides | jq -R -s -c 'split(\"\n\")[:-1]' > /usr/share/nginx/html/assets/data/safety.json" >> /etc/crontabs/root

# 5. Build ignition process controller
COPY ./scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/app/entrypoint.sh"]
