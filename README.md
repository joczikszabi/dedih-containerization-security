# DEDIH Containerization and Security

Teaching repository for the **Konténer alkalmazások biztonsága** course,
ELTE IK, DEDIH 2.0.

The same Snake game as the Cloud Migration course, packaged into a container,
cleaned up, then run on Kubernetes. The game is deliberately trivial. What
happens around it is the subject.

Participants follow **[docs/LAB.md](docs/LAB.md)**, which is in Hungarian.

## What the day looks like

|  | Image size | CRITICAL + HIGH | Runs as |
| --- | --- | --- | --- |
| The naive `app/Dockerfile` | 1.81 GB | 419 | root, uid 0 |
| `app/Dockerfile.hardened` | 245 MB | 8 | node, uid 1000 |

All eight remaining findings come from the `node:22-alpine` base image, none
from the application. That is the argument for base image choice and rebuild
cadence, in one line.

## No cloud account

Everything runs inside a GitHub Codespace: Docker in Docker for building, and
`kind` for the cluster. No subscription, no quota, no region, no cost, and
nothing to tear down that could keep billing. The whole cluster uses about
900 MB.

## Layout

```
.devcontainer/     Codespace definition, installs kind and trivy
app/               the application and everything Docker related
  Dockerfile           the unoptimised starting point, participants edit this
  Dockerfile.hardened  the finished version: multi stage, alpine, non root
  .dockerignore        what is kept out of the build context
  server.js            entry point, Express, plain JavaScript, ESM
  lib/                 config, database access, in-memory fallback, validation, routes
  src/                 React and TypeScript, Snake on a canvas
compose.yaml       the application and Postgres together, block 3
scan.sh            prints the CRITICAL and HIGH count for an image
kind/              kind-config.yaml, one node with a port mapping for the NodePort
k8s/               deployment and NodePort service, postgres, attacker pod, network policy
.github/workflows/ three workflow_dispatch workflows, an alternative to the terminal
docs/LAB.md        the participant handout, Hungarian
```

## The status panel

The application reports the platform it landed on, so every lesson is visible
in the browser rather than in `kubectl` output:

```
Pod           snake-7d4f9c-x2k1     which replica answered this request
Image         snake:v2              changes pod by pod during a rolling update
Running as    node (uid 1000)       red until block 3 fixes it
Leaderboard   shared database       "this pod only" until Postgres exists
```

## Running it locally

```bash
cd app
npm install
npm run build
npm start          # http://localhost:3000
```

With no `DATABASE_URL` the leaderboard lives in the process. That is not a
fallback that happens to work, it is the setup for the most important lesson of
the day: run three replicas and the same score appears and disappears
depending on which one answers.

With a database:

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=snakepw -e POSTGRES_USER=snake \
  -e POSTGRES_DB=snake -p 5432:5432 postgres:17-alpine
DATABASE_URL=postgres://snake:snakepw@localhost:5432/snake npm start
```

## Notes for whoever teaches this next

- `kubectl port-forward` does **not** load balance. It pins one pod, which
  silently breaks the replica demo. Hence the NodePort in `kind/kind-config.yaml`.
- A NetworkPolicy does not cut off established connections, only new ones. The
  lab teaches this deliberately: apply the policy, observe that nothing
  happens, then restart the pods.
- `postCreateCommand` runs at container creation, not on restart. Anyone who
  fixes it has to rebuild the container.
- The Postgres deployment uses an `emptyDir`, so deleting that pod loses the
  data. That is the stateless versus stateful conversation, not an oversight.

## Licence

MIT. The application originates in
[dedih-cloud-migration](https://github.com/joczikszabi/dedih-cloud-migration).
