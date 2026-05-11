FROM node:22

WORKDIR /app

# 先複製 lockfile 與 prisma schema（postinstall 會跑 prisma generate）
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# 複製其他原始碼
COPY . .

# build: prisma generate && prisma db push --skip-generate && next build
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
