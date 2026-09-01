FROM node:22

WORKDIR /app

# 先複製 lockfile 與 prisma schema（postinstall 會跑 prisma generate）
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# 複製其他原始碼
COPY . .

# build 不連 DB：只 generate client 與 next build；db push 移到 entrypoint（runtime）
RUN npx prisma generate && npx next build

# runtime 入口：等 DB → prisma db push → npm start
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]
