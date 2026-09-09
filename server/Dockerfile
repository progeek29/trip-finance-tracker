# WanderSync backend — Hugging Face Spaces (Docker, no-sleep free tier)
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Hugging Face Spaces serves on port 7860
EXPOSE 7860
ENV PORT=7860

CMD ["node", "index.cjs"]
