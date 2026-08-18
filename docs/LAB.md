# Konténerizáció és biztonság, gyakorlati útmutató

ELTE IK, DEDIH 2.0. Ebben a dokumentumban benne van minden lépés, amit ma
végigcsinálunk. Ha lemaradsz, ebből egyedül is tudsz haladni tovább.

---

## Mit csinálunk ma

| Blokk | Téma |
| --- | --- |
| 1 | Mi az a konténer, és miért jó. Elindítunk egy Postgres-t egy paranccsal. |
| 2 | Dockerfile: megépítjük a Snake játék image-ét, aztán optimalizáljuk. |
| 3 | Biztonság és Docker Compose. |
| 4 | Kubernetes alapok. |
| 5 | Kubernetes biztonsági beállítások. |

A játék mellett van egy státusz panel. Ez mutatja, hogy éppen hol és hogyan fut
az alkalmazás:

```
Pod           snake-7d4f9c-x2k1
Image         snake:v2
Running as    node (uid 1000)
Leaderboard   shared database
```

Ide jutunk el a nap végére:

| | Image mérete | CRITICAL + HIGH sebezhetőség | Milyen userként fut |
| --- | --- | --- | --- |
| Reggel | 1.78 GB | 419 | root (uid 0) |
| Délután | 245 MB | 8 | node (uid 1000) |

A maradék 8 találat az alap image-ből származik, egy sem a saját kódunkból.

---

## Fontos tudnivalók

**1. Ma nincs szükség Azure előfizetésre.** Minden a saját Codespace-edben fut.
Nincs felhő, nincs költség, nincs kvóta.

**2. Ma sem kell semmit git-be pusholni.** Forkolod a repót, nyitsz rajta egy
Codespace-t, ott szerkesztesz és futtatsz.

**3. Ha elakadsz, a `solutions/` mappában megtalálod a kész megoldást.** Másold
be, és haladj tovább.

**4. A nap végén töröld a Codespace-t.**

---

## 0. Előkészületek

1. Nyisd meg: `https://github.com/joczikszabi/dedih-containerization-security`
2. Jobb felül **Fork**, majd **Create fork**.
3. A **saját** forkodon: zöld **Code** gomb, **Codespaces** fül,
   **Create codespace on main**.
4. Az első indítás három-négy perc.

Ha kész, ellenőrizd:

```bash
docker --version
docker compose version
kubectl version --client
kind --version
trivy --version
```

> Ha valamelyiket nem találja, akkor a container létrehozásakor futó szkript
> hibára futott. A javítás: `F1` billentyű, majd
> **Codespaces: Rebuild Container**. A `postCreateCommand` ugyanis csak a
> container létrehozásakor fut le, újraindításkor nem.

---

## 1. Blokk: mi az a konténer

### 1.1 Indíts el egy adatbázist egy paranccsal

```bash
docker run -d --name db \
  -e POSTGRES_USER=snake \
  -e POSTGRES_PASSWORD=snakepw \
  -e POSTGRES_DB=snake \
  postgres:17-alpine
docker ps
```

Nézzük meg, hogy tényleg működik:

```bash
docker exec -it db psql -U snake -d snake -c "SELECT version();"
```

Nem telepítettél Postgres-t, nincs is a gépeden, és mégis fut egy adatbázis.
Ez a konténer legfontosabb tulajdonsága: valaki más összerakta, te pedig
elindítod.

### 1.2 Nézz bele

```bash
docker exec -it db sh
```

A konténeren belül:

```sh
whoami      # postgres
ps aux      # csak a saját folyamatait látja
ls /        # saját fájlrendszer
exit
```

Ugyanaz a folyamat kívülről is látszik:

```bash
ps aux | grep postgres | head -3
```

A konténer nem virtuális gép. Ugyanazon a kernelen fut, mint a Codespace, csak
el van szigetelve tőle. Ez a különbség a nap végén lesz fontos.

Állítsuk le egyelőre:

```bash
docker stop db && docker rm db
```

### 1.3 A repo felépítése

```
app/               a Snake játék forráskódja és a Dockerfile
compose.yaml       két konténer együtt, ezt a 3. blokkban használjuk
kind/              a helyi Kubernetes cluster beállítása
k8s/               Kubernetes manifest fájlok
solutions/         kész megoldások, ha elakadsz
docs/LAB.md        ez a dokumentum
```

A `app/` mappában egy egyszerű Node.js alkalmazás van: egy Snake játék, mellette
egy szerver, ami a toplistát kezeli. Ezt fogjuk konténerbe tenni.

---

## 2. Blokk: Dockerfile

### 2.1 Építsd meg az első image-et

A `app/Dockerfile` egy tipikus, első nekifutásra megírt JavaScript Dockerfile.
Működik, de sok probléma van vele.

```bash
cd app
docker build -t snake:step0 .
docker images snake:step0
```

Jegyezd fel a méretet. Nálam **1.78 GB**.

Indítsd el:

```bash
docker run --rm -p 3000:3000 snake:step0
```

A Codespace felajánlja a 3000-es portot. Nyisd meg, és játssz egy kört.
Nyilakkal irányíthatsz, szóközzel szüneteltethetsz.

A `Leaderboard` sor azt írja: `this pod only`. Fut egy adatbázisod is az előbb,
mégsem találja. Erre a 3. blokkban visszatérünk.

### 2.2 `.dockerignore`

```bash
cat > .dockerignore <<'EOF'
node_modules
dist
.git
*.md
.env
EOF
docker build -t snake:step1 .
```

A méret alig változik, a build viszont sokkal gyorsabb lesz. Eddig a saját
`node_modules` mappád is felment a build kontextusba, teljesen fölöslegesen.

### 2.3 Csak production függőségek

A `Dockerfile`-ban cseréld ki ezt:

```dockerfile
RUN npm install
```

erre:

```dockerfile
RUN npm ci --omit=dev
```

Így viszont a `npm run build` hibára fut, mert a `vite` devDependency. Ezt a
problémát oldja meg a következő lépés.

### 2.4 Multi-stage build

Két szakasz. Az elsőben megvan az egész eszközkészlet, és lefordítjuk a
frontendet. A másodikba már csak a kész eredmény kerül át.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server.js ./
COPY lib ./lib
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t snake:v1 .
docker images | head -5
```

1.78 GB helyett 245 MB. A `vite`, a `typescript` és az `eslint` mind benne volt
az első image-ben, pedig egyikre sincs szükség futásidőben.

> Ha elakadtál: `cp ../solutions/Dockerfile.hardened Dockerfile`

Írd be a chatbe, hány MB lett a tiéd.

### 2.5 Devcontainer

Nyisd meg a `.devcontainer/Dockerfile` fájlt.

```dockerfile
FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

ARG KIND_VERSION=v0.30.0
ARG TRIVY_VERSION=0.74.0

RUN ... kind
RUN ... trivy
```

Ez ugyanolyan Dockerfile, mint amit az előbb írtál. `FROM`, `RUN`, rétegek,
pinnelt verziók. Csak nem egy alkalmazást csomagol, hanem azt a környezetet,
amiben most dolgozol.

A mellette lévő `devcontainer.json` mondja meg, hogy melyik Dockerfile-ból
épüljön, milyen portok legyenek nyitva, és milyen VS Code extension-ök
települjenek.

Ezért van mindenkinél ugyanaz a Node verzió és ugyanaz a `kubectl`, és ezért
nem kellett senkinek semmit telepítenie.

> Ez nem Codespaces-specifikus. Ugyanez a két fájl működik lokálisan is, VS
> Code-ban a Dev Containers extension-nel, vagy a `devcontainer` CLI-vel. A
> Codespaces csak az egyik hely, ahol el lehet indítani.

Gyakorlati haszna: egy új kolléga két nap helyett öt perc alatt jut működő
környezethez, és mindenki ugyanazt kapja.

---

## 3. Blokk: biztonság és Compose

### 3.1 Mi van az image-ben?

Nézzünk meg egy közismert, hivatalos image-et:

```bash
trivy image --severity CRITICAL,HIGH node:22
```

Több száz találat. Ez nem a te hibád, és nem is a Node.js csapaté: egy teljes
Debian van benne, a hozzá tartozó összes csomaggal.

Most a tiédet, előtte és utána:

```bash
trivy image --severity CRITICAL,HIGH snake:step0
trivy image --severity CRITICAL,HIGH snake:v1
```

Nálam 419-ről 8-ra csökkent. A `node:22-alpine` image-ben szintén pontosan 8
van, vagyis a maradék mind az alap image-ből jön, egy sem a saját kódunkból.
Ezért fontos, hogy melyik alap image-et választod, és hogy milyen gyakran
építed újra.

### 3.2 Ne rootként fusson

```bash
docker run --rm snake:v1 id -u
```

Nulla, vagyis root. Ha valaki hibát talál az alkalmazásban, rögtön rootként áll
a konténerben.

Tedd a `Dockerfile` végére, a `CMD` elé:

```dockerfile
USER node
```

```bash
docker build -t snake:v2 .
docker run --rm snake:v2 id -u     # 1000
docker run --rm -p 3000:3000 -e IMAGE_TAG=snake:v2 snake:v2
```

A státusz panelen a `Running as` sor most zöld: `node (uid 1000)`.

### 3.3 Ne kerüljön titok az image-be

Csinálj egy titkot, és építsd meg az eredeti, optimalizálatlan Dockerfile-lal,
`.dockerignore` nélkül:

```bash
echo "DB_PASSWORD=SUPER_SECRET_12345" > .env
mv .dockerignore .dockerignore.off
docker build -f ../solutions/Dockerfile.naive -t snake:leaky .
docker run --rm snake:leaky cat /app/.env
```

Ott a jelszó. A `COPY . .` mindent bemásolt, a `.env` fájlt is, és aki le tudja
húzni az image-et, el is tudja olvasni.

Most állítsuk vissza, és próbáljuk meg a mostani Dockerfile-lal:

```bash
mv .dockerignore.off .dockerignore
docker build -t snake:v2 .
docker run --rm snake:v2 cat /app/.env    # nincs ilyen fájl
rm .env
```

Két dolog is megvédett. A `.dockerignore` eleve ki sem engedte a build
kontextusba, a multi-stage build pedig csak a lefordított eredményt hozta át a
végleges image-be.

### 3.4 Docker Compose

Emlékszel, hogy a 2.1-ben futott egy adatbázisod, az alkalmazás mégsem találta?
Nézzük meg, miért.

Indítsuk el megint mindkettőt külön:

```bash
cd /workspaces/dedih-containerization-security
docker run -d --name db -e POSTGRES_USER=snake -e POSTGRES_PASSWORD=snakepw \
  -e POSTGRES_DB=snake postgres:17-alpine
docker run -d --name snake -p 3000:3000 \
  -e DATABASE_URL='postgres://snake:snakepw@db:5432/snake' snake:v2
sleep 10
curl -s localhost:3000/api/health
```

```
{"db":"unavailable","detail":"Connecting, attempt 4 of 6 failed.", ...}
```

Az alkalmazás nem találja a `db` nevű gépet. A két konténer a Docker
alapértelmezett hálózatán van, ahol nincs névfeloldás. Nem hibáztak, csak nem
tudnak egymásról.

```bash
docker rm -f db snake
```

Most nézd meg a `compose.yaml` fájlt a repo gyökerében.

> A fájl neve régebben `docker-compose.yml` volt, és a legtöbb létező projektben
> még mindig így hívják. A mai ajánlott név a `compose.yaml`, de a Docker
> mindkettőt felismeri. Ugyanaz a fájl, ugyanaz a tartalom.

Indítsd el:

```bash
docker compose up --build
```

Egy másik terminálban:

```bash
curl -s localhost:3000/api/health
```

```
{"db":"ok","detail":"Connected, scores table ready.", "store":"database", ...}
```

A Compose létrehozott egy hálózatot a két service-nek, és mindkettőt
regisztrálta a saját nevén. Ezért lett a `db` valódi hostnév:

```bash
docker compose exec snake getent hosts db
```

Nyisd meg a böngészőben a 3000-es portot. A `Leaderboard` sor zöld:
`shared database`. Játssz egy kört, és a pontszámod frissítés után is megmarad.

> Figyeld meg, hogy nem `localhost` szerepel a `DATABASE_URL`-ben. A konténeren
> belül a `localhost` maga a konténer.

### 3.5 Ameddig a Compose elég, és ameddig nem

Próbáljunk három példányt indítani az alkalmazásból:

```bash
docker compose up -d --scale snake=3
```

```
Error response from daemon: failed to set up container networking:
Bind for 0.0.0.0:3000 failed: port is already allocated
```

A Compose egy gépen tud több service-t egymás mellett futtatni. Azt viszont nem
tudja, hogy három példányt tegyen egyetlen cím mögé, elossza köztük a
forgalmat, és újraindítsa azt, amelyik meghal. Erről szól a következő blokk.

```bash
docker compose down
```

---

## 4. Blokk: Kubernetes alapok

### 4.1 Indíts egy clustert

A `kind` egy Kubernetes clustert futtat Docker konténerekben. Így nincs
szükség se felhőre, se külön gépre.

```bash
cd /workspaces/dedih-containerization-security
kind create cluster --config kind/cluster.yaml
kubectl get nodes
```

Az image-et át kell adni a clusternek, mert nincs registry:

```bash
kind load docker-image snake:v2 --name dedih
```

### 4.2 Telepítsd az alkalmazást

```bash
kubectl apply -f k8s/snake.yaml
kubectl get pods
kubectl rollout status deployment/snake
```

Nyisd meg a 8080-as portot. A játék most Kubernetesen fut.

A státusz panel `Pod` sora most már ki van töltve.

### 4.3 Skálázás

```bash
kubectl scale deployment/snake --replicas=3
kubectl get pods
```

Frissítsd a böngészőt többször. A `Pod` sor változik. Három példány fut egyetlen
cím mögött, és nem mindig ugyanaz válaszol. Ezt a Compose nem tudta.

### 4.4 Mi történik, ha törlünk egy podot?

```bash
kubectl delete pod $(kubectl get pod -l app=snake -o jsonpath='{.items[0].metadata.name}')
kubectl get pods
```

Visszajött magától. Ezt nem te csináltad, hanem a cluster. Te azt mondtad, hogy
három példány legyen, és a Kubernetes ezt tartja fenn.

### 4.5 A toplista, három példánnyal

Játssz egy kört, küldd be a pontszámot, majd frissítsd a lapot néhányszor.

A pontszámod hol megjelenik, hol nem.

Ennek az az oka, hogy most nincs adatbázis, a toplista pedig annak a podnak a
memóriájában van, amelyik éppen fogadta a kérésedet. A másik kettő nem tud róla.
A Compose-nál ez nem tűnt fel, mert ott egyetlen példány futott.

Ez a mai nap legfontosabb tanulsága: a konténer eldobható, és ami benne van, az
vele együtt eltűnik.

### 4.6 Adatbázis és Secret

Először a titkok. Ezek nincsenek benne a repóban, és nem is lesznek:

```bash
kubectl create secret generic snake-db \
  --from-literal=POSTGRES_USER=snake \
  --from-literal=POSTGRES_PASSWORD=snakepw \
  --from-literal=POSTGRES_DB=snake \
  --from-literal=DATABASE_URL='postgres://snake:snakepw@postgres:5432/snake'
```

Aztán az adatbázis:

```bash
kubectl apply -f k8s/postgres.yaml
kubectl rollout status deployment/postgres
```

Végül szólj az alkalmazásnak, hol találja:

```bash
kubectl set env deployment/snake --from=secret/snake-db --keys=DATABASE_URL
kubectl rollout status deployment/snake
```

A `Leaderboard` sor zöldre vált, és a pontszámod most már mindhárom pod
számára ugyanaz.

> Ugyanez a lépés a felhő migráció kurzuson Key Vault volt. Ott az Azure adta át
> a titkot a Web App környezeti változójaként, itt a Kubernetes adja át a
> podnak. Az alkalmazás kódja egyik esetben sem tud róla.

---

## 5. Blokk: Kubernetes biztonsági beállítások

### 5.1 Mit tud egy privilegizált pod?

```bash
kubectl apply -f k8s/attacker-pod.yaml
kubectl exec -it attacker -- chroot /host sh
```

Most a node fájlrendszerét olvasod, egy konténer belsejéből. Ennek a neve
angolul *container escape*:

```sh
ls /etc
cat /etc/hostname
exit
```

Nem történt semmi különleges: a pod privilegizált jogot és a node gyökerét
kérte, a cluster pedig alapból megadta.

```bash
kubectl delete pod attacker
```

### 5.2 A cluster visszautasítja

```bash
kubectl label ns default pod-security.kubernetes.io/enforce=restricted
kubectl apply -f k8s/attacker-pod.yaml
```

```
Error from server (Forbidden): pods "attacker" is forbidden:
violates PodSecurity "restricted:latest": privileged, allowPrivilegeEscalation
!= false, unrestricted capabilities, restricted volume types, runAsNonRoot !=
true, seccompProfile
```

Ugyanaz a fájl, öt perccel később, és most nem engedi. Nem az alkalmazást
védtük meg, hanem a platformot állítottuk be úgy, hogy ilyet ne engedjen.

És a mi alkalmazásunk?

```bash
kubectl rollout restart deployment/snake
kubectl rollout status deployment/snake
```

Elindul, mert a `k8s/snake.yaml` már tartalmazza mindazt, amit a `restricted`
elvár.

> Figyeld meg a figyelmeztetést a `postgres` podról: a hivatalos Postgres image
> nem felel meg a `restricted` szintnek. A valóságban is így van, a third-party
> image-ek gyakran nem felelnek meg.

### 5.3 NetworkPolicy

Az alkalmazás és az adatbázis most szabadon kommunikál. Vágjuk el a kapcsolatot:

```bash
kubectl apply -f k8s/networkpolicy.yaml
```

Nézd a böngészőt fél percen át. Nem történik semmi, a panel zöld marad.

Ennek az az oka, hogy a NetworkPolicy az új kapcsolatokat tiltja, a meglévőket
nem bontja el. Az alkalmazás connection poolja pedig már nyitva tartja a
kapcsolatot.

> Ez fontos, és sokan nem tudják: egy NetworkPolicy nem vág el egy támadót,
> akinek már van élő kapcsolata. Csak az új kapcsolatokra vonatkozik.

Most kényszerítsünk ki új kapcsolatot:

```bash
kubectl rollout restart deployment/snake
```

Néhány másodperc múlva a panel sárgára vált, alatta ez áll:
`Connecting, attempt 2 of 6 failed.`

Vedd le a szabályt:

```bash
kubectl delete -f k8s/networkpolicy.yaml
```

Fél percen belül magától visszaáll. Nem indítottunk újra semmit, az alkalmazás
végig újrapróbálkozott.

---

## 6. Takarítás

```bash
kind delete cluster --name dedih
docker compose down
```

A Codespace törlése: a forkodon **Code** gomb, **Codespaces** fül, a három pont,
**Delete**.

---

## 7. Hibaelhárítás

**Valamelyik parancsot (`kind`, `trivy`) nem találja a terminál.**
`F1`, majd **Codespaces: Rebuild Container**. A `postCreateCommand` csak a
container létrehozásakor fut le, újraindításkor nem.

**`port is already allocated`.**
Fut még valami azon a porton. `docker ps`, majd `docker rm -f <név>`, vagy
`docker compose down`.

**A `kind create cluster` sokáig tart.**
Az első alkalommal letölti a node image-et, ami körülbelül egy gigabyte.

**A 8080-as porton nem válaszol semmi, közvetlenül a cluster létrehozása után.**
Várj tíz másodpercet, és próbáld újra. A kube-proxy szabályainak kell egy kis
idő.

**`ImagePullBackOff` a podon.**
Kimaradt a `kind load docker-image snake:v2 --name dedih` parancs. A cluster nem
látja automatikusan a Docker image-eidet.

**A pod `CreateContainerConfigError` állapotban van.**
Hiányzik a `snake-db` secret. Lásd a 4.6-os lépést.

**A státusz panelen a `Running as` sor sárga: `root (uid 0)`.**
Az image-ből hiányzik a `USER node` sor, vagy nem építetted újra utána.

**Mindent elrontottam, tiszta lapot szeretnék.**

```bash
kind delete cluster --name dedih
kind create cluster --config kind/cluster.yaml
```

---

## 8. Parancsok összefoglalva

| Parancs | Mit csinál |
| --- | --- |
| `docker run -d --name x kep` | konténer indítása a háttérben |
| `docker ps` | mi fut éppen |
| `docker exec -it x sh` | belépés egy futó konténerbe |
| `docker build -t nev .` | image építése a Dockerfile alapján |
| `docker images` | image-ek és méretük |
| `trivy image nev` | sebezhetőségek keresése |
| `docker compose up --build` | a compose.yaml-ban leírt service-ek indítása |
| `docker compose down` | leállítás és takarítás |
| `kind create cluster` | helyi Kubernetes cluster indítása |
| `kind load docker-image nev` | image átadása a clusternek |
| `kubectl apply -f fajl.yaml` | erőforrás létrehozása vagy módosítása |
| `kubectl get pods` | mi fut a clusterben |
| `kubectl scale deployment/x --replicas=3` | példányszám állítása |
| `kubectl rollout restart deployment/x` | az összes pod újraindítása |
| `kubectl create secret generic ...` | secret létrehozása |
