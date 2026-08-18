# Konténerizáció és biztonság, gyakorlati útmutató

ELTE IK, DEDIH 2.0. Ebben a dokumentumban benne van minden lépés, amit ma
végigcsinálunk. Ha lemaradsz, ebből egyedül is tudsz haladni tovább.

---

## Mit csinálunk ma

Ma egy Snake játékot teszünk konténerbe, majd Kubernetesen futtatjuk. Közben az
image jóval kisebb és biztonságosabb lesz.

A játék mellett van egy státusz panel. Ez mutatja, hogy éppen hol és hogyan fut
az alkalmazás:

```
Pod           snake-7d4f9c-x2k1
Image         snake:v2
Running as    node (uid 1000)
Leaderboard   shared database
```

**Ugyanaz az alkalmazás, három lépésben.** Ide jutunk el a nap végére:

| | Image mérete | CRITICAL + HIGH sebezhetőség | Milyen userként fut |
| --- | --- | --- | --- |
| Reggel | 1.78 GB | 419 | root (uid 0) |
| Délután | 245 MB | 8 | node (uid 1000) |

A maradék 8 találat az alap image-ből származik, egy sem a saját kódunkból.

---

## Fontos tudnivalók

**1. Ma nincs szükség Azure előfizetésre.** Minden a saját Codespace-edben fut.
Nincs felhő, nincs költség, nincs kvóta, és nincs mit leállítani a nap végén.

**2. Ma sem kell semmit git-be pusholni.** Forkolod a repót, nyitsz rajta egy
Codespace-t, ott szerkesztesz és futtatsz.

**3. Ha elakadsz, a `solutions/` mappában megtalálod a kész megoldást.** Másold
be, és haladj tovább. Semmi baj, ha nem elsőre jön össze.

**4. A nap végén töröld a Codespace-t.** A GitHub free tier általában fedezi,
de fölöslegesen ne fusson.

---

## 0. Előkészületek

1. Nyisd meg: `https://github.com/joczikszabi/dedih-containerization-security`
2. Jobb felül **Fork**, majd **Create fork**.
3. A **saját** forkodon: zöld **Code** gomb, **Codespaces** fül,
   **Create codespace on main**.
4. Az első indítás három-négy perc. Közben feltelepül a Docker, a `kubectl`,
   a `kind` és a `trivy`.

Ha kész, ellenőrizd:

```bash
docker --version
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

### 1.1 Futtass egy konténert

```bash
docker run --rm -p 3000:3000 ghcr.io/joczikszabi/dedih-snake:v1
```

> Ha ez nem működik (például mert a registry nem elérhető), építsd meg magad.
> Két-három perc, és a következő blokkban úgyis foglalkozunk vele:
>
> ```bash
> cd app && docker build -t snake:v1 . && docker run --rm -p 3000:3000 snake:v1
> ```

A Codespace felajánlja a 3000-es portot. Nyisd meg, és játssz egy kört.
Nyilakkal irányíthatsz, szóközzel szüneteltethetsz.

Nem telepítettél Node.js-t, és nincs is a gépeden. Az image mindent tartalmaz,
amire az alkalmazásnak szüksége van.

### 1.2 Nézz bele

Új terminálban:

```bash
docker ps
docker exec -it $(docker ps -q --filter ancestor=ghcr.io/joczikszabi/dedih-snake:v1) sh
```

A konténeren belül:

```sh
ps aux      # csak a saját folyamatait látja
ls /        # saját fájlrendszer
whoami      # root
exit
```

Majd kívül:

```bash
ps aux | grep node
```

Ugyanaz a folyamat, csak máshonnan nézve. A konténer nem virtuális gép:
ugyanazon a kernelen fut, mint a Codespace, csak el van szigetelve tőle. Ez a
különbség a nap végén lesz fontos.

A konténert `Ctrl+C`-vel állíthatod le abban a terminálban, amelyikben fut.

---

## 2. Blokk: hogyan épül fel egy image

A repóban van egy `app/Dockerfile`. Ez működik, de sok probléma van vele.

### 2.1 Építsd meg

```bash
cd app
docker build -t snake:step0 .
docker images snake:step0
```

Jegyezd fel a méretet. Nálam **1.78 GB**.

### 2.2 Első lépés: `.dockerignore`

```bash
cat > .dockerignore <<'EOF'
node_modules
dist
.git
*.md
.env
EOF
docker build -t snake:step1 .
docker images | head -4
```

A méret alig változik, a build viszont sokkal gyorsabb lesz. Eddig a saját
`node_modules` mappád is felment a build kontextusba, teljesen fölöslegesen.

### 2.3 Második lépés: csak production függőségek

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

### 2.4 Harmadik lépés: multi-stage build

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
docker build -t snake:step3 .
docker images | head -5
```

1.78 GB helyett 245 MB. A `vite`, a `typescript` és az `eslint` mind benne volt
az első image-ben, pedig egyikre sincs szükség futásidőben.

> Ha elakadtál: `cp ../solutions/Dockerfile.hardened Dockerfile`

Írd be a chatbe, hány MB lett a tiéd.

### 2.5 Devcontainer

Nyisd meg a repo gyökerében a `.devcontainer/devcontainer.json` fájlt.

```json
"image": "mcr.microsoft.com/devcontainers/javascript-node:22-bookworm",
"features": {
  "ghcr.io/devcontainers/features/docker-in-docker:2": {},
  "ghcr.io/devcontainers/features/kubectl-helm-minikube:1": {}
}
```

Ez a fájl írja le azt a gépet, amiben most dolgozol. A Codespace nem virtuális
gép, hanem konténer. Ezért van mindenkinél ugyanaz a Node verzió és ugyanaz a
`kubectl`, és ezért nem kellett senkinek semmit telepítenie.

Ugyanaz a technológia, csak nem a production, hanem a saját fejlesztői
környezeted felé fordítva. Egy új kolléga így két nap helyett öt perc alatt jut
működő környezethez.

---

## 3. Blokk: mi van az image-ben

### 3.1 A törölt fájl

Hozz létre egy titkot, aztán töröld le a Dockerfile-ban:

```bash
cd /workspaces/dedih-containerization-security/app
echo "DB_PASSWORD=SUPER_SECRET_12345" > .env
docker build -f ../solutions/Dockerfile.leaky -t snake:leaky .
```

Most keressük meg:

```bash
docker history snake:leaky
mkdir -p /tmp/leaky && docker save snake:leaky -o /tmp/leaky.tar
tar -xf /tmp/leaky.tar -C /tmp/leaky
grep -r "SUPER_SECRET" /tmp/leaky 2>/dev/null | head -3
```

Kitörölted, mégis benne maradt. Egy image rétegek sorozata, és a törlés is csak
egy újabb réteg, ami annyit jelent, hogy ez a fájl már nincs ott. Ami alatta
van, az megmarad, és aki le tudja húzni az image-et, el is tudja olvasni.

```bash
rm .env
```

### 3.2 Sebezhetőségek

Nézzünk meg egy közismert, hivatalos image-et:

```bash
trivy image --severity CRITICAL,HIGH node:22
```

Több száz találat. Ez nem a te hibád, és nem is a Node.js csapaté: egy teljes
Debian van benne, a hozzá tartozó összes csomaggal.

Most a tiédet:

```bash
trivy image --severity CRITICAL,HIGH snake:step0
trivy image --severity CRITICAL,HIGH snake:step3
```

Nálam 419-ről 8-ra csökkent. A `node:22-alpine` image-ben szintén pontosan 8
van, vagyis a maradék mind az alap image-ből jön, egy sem a saját kódunkból.
Ezért fontos, hogy melyik alap image-et választod, és hogy milyen gyakran
építed újra.

### 3.3 Ne rootként fusson

```bash
docker run --rm snake:step3 id -u
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
```

Indítsd el, és nézd meg a státusz panelt:

```bash
docker run --rm -p 3000:3000 -e IMAGE_TAG=snake:v2 snake:v2
```

A `Running as` sor most zöld: `node (uid 1000)`.

> Nem technikai kollégáknak: ha valaki konténerben szállít nektek szoftvert,
> négy kérdéssel a problémák nagy részét ki lehet szűrni. Melyik alap image-re
> épül? Mikor építették újra utoljára? Meg lehet kapni a scan riportot?
> Rootként fut?

---

## 4. Blokk: Kubernetes

### 4.1 Indíts egy clustert

```bash
cd /workspaces/dedih-containerization-security
kind create cluster --config kind/cluster.yaml
kubectl get nodes
```

Körülbelül egy perc. A cluster egy Docker konténerben fut, a Codespace-eden
belül.

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

Nyisd meg a 8080-as portot a Codespace-ben. A játék most Kubernetesen fut.

A státusz panel `Pod` sora most már ki van töltve. A `Leaderboard` sor viszont
azt írja: `this pod only`.

### 4.3 Skálázás

```bash
kubectl scale deployment/snake --replicas=3
kubectl get pods
```

Frissítsd a böngészőt többször. A `Pod` sor változik. Három példány fut, és nem
mindig ugyanaz válaszol.

### 4.4 Mi történik, ha törlünk egy podot?

```bash
kubectl delete pod $(kubectl get pod -l app=snake -o jsonpath='{.items[0].metadata.name}')
kubectl get pods
```

Visszajött magától. Ezt nem te csináltad, hanem a cluster. Te azt mondtad, hogy
három példány legyen, és a Kubernetes ezt tartja fenn.

### 4.5 Játssz, és nézd meg a toplistát

Játssz egy kört, írd be a nevedet, küldd be a pontszámot. Utána frissítsd a
lapot néhányszor.

A pontszámod hol megjelenik, hol nem.

Ennek az az oka, hogy a toplista annak a pod-nak a memóriájában van, amelyik
éppen fogadta a kérésedet. A másik kettő nem tud róla. Ez a mai nap
legfontosabb tanulsága: a konténer eldobható, és ami benne van, az vele együtt
eltűnik.

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

Nézd meg a böngészőt. A `Leaderboard` sor zöldre vált: `shared database`.
Játssz egy kört, és most már frissítés után is megmarad a pontszámod, akármelyik
pod válaszol.

> Ugyanez a lépés a felhő migráció kurzuson Key Vault volt. Ott az Azure adta át
> a titkot a Web App környezeti változójaként, itt a Kubernetes adja át a
> pod-nak. Az alkalmazás kódja egyik esetben sem tud róla.

### 4.7 Rolling update

```bash
docker tag snake:v2 snake:v3
kind load docker-image snake:v3 --name dedih
kubectl set image deployment/snake snake=snake:v3
```

Közben frissítsd a böngészőt, sokszor. Az `Image` sor pod-onként vált át, a
játék pedig végig működik. Nincs leállás.

---

## 5. Blokk: a cluster biztonsági beállításai

### 5.1 Mit tud egy privilegizált pod?

```bash
kubectl apply -f k8s/attacker-pod.yaml
kubectl exec -it attacker -- chroot /host sh
```

Most a node fájlrendszerét olvasod, egy konténer belsejéből. Ennek a neve
angolul *container escape*, és ez a konténerek egyik legfontosabb kockázata:

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
elvár. Ha előre rendben van a beállítás, akkor a szabály nem okoz problémát.

> Figyeld meg a figyelmeztetést a `postgres` pod-ról: a hivatalos Postgres image
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

Néhány másodperc múlva a panel sárgára vált. A `Leaderboard` sor újra
`this pod only`, alatta pedig ez áll: `Connecting, attempt 2 of 6 failed.`

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
```

A Codespace törlése: a forkodon **Code** gomb, **Codespaces** fül, a három pont,
**Delete**.

---

## 7. Hibaelhárítás

**Valamelyik parancsot (`kind`, `trivy`) nem találja a terminál.**
`F1`, majd **Codespaces: Rebuild Container**. A `postCreateCommand` csak a
container létrehozásakor fut le, újraindításkor nem.

**A `kind create cluster` sokáig tart.**
Az első alkalommal letölti a node image-et, ami körülbelül egy gigabyte. Utána
gyors.

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

A Docker image-ek megmaradnak, csak újra be kell tölteni őket a clusterbe.

---

## 8. Parancsok összefoglalva

| Parancs | Mit csinál |
| --- | --- |
| `docker build -t nev .` | image építése a Dockerfile alapján |
| `docker images` | image-ek és méretük |
| `docker run -p 3000:3000 nev` | konténer indítása, port publikálásával |
| `docker exec -it <id> sh` | belépés egy futó konténerbe |
| `docker history nev` | az image rétegei |
| `trivy image nev` | sebezhetőségek keresése |
| `kind create cluster` | helyi Kubernetes cluster indítása |
| `kind load docker-image nev` | image átadása a clusternek |
| `kubectl apply -f fajl.yaml` | erőforrás létrehozása vagy módosítása |
| `kubectl get pods` | mi fut éppen |
| `kubectl scale deployment/x --replicas=3` | példányszám állítása |
| `kubectl rollout restart deployment/x` | az összes pod újraindítása |
| `kubectl create secret generic ...` | secret létrehozása |
| `kubectl label ns default pod-security...` | Pod Security Standards bekapcsolása |
