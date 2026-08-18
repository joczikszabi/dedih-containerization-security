# Block 2 starts here. This image works, and almost everything about it is wrong.
#
# Nothing below is a strawman. Every line is something you will find in a real
# repository. The point of the block is to fix them one at a time and watch the
# number in `docker images` fall.

FROM node:22

WORKDIR /app

# No .dockerignore yet, so this copies your local node_modules and dist too.
COPY . .

# Installs devDependencies as well: vite, eslint, typescript, all of it.
RUN npm install
RUN npm run build

ARG IMAGE_TAG=dev
ENV IMAGE_TAG=$IMAGE_TAG

EXPOSE 3000

# Runs as root, because nothing said otherwise.
CMD ["npm", "start"]
