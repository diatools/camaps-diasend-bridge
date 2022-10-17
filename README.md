# camaps-diasend-bridge

Diese Bridge exportiert vergangene und aktuelle Daten live aus diasend und pflegt diese in Nightscout ein.

## Installation und Start (standalone)
1. clone das repo
2. diasend.env.example variablen setzen
3. starten
```
yarn && yarn start
```

## Installation mit docker-compose
Falls Nightscout **nicht** auf der selben Maschine oder Docker läuft entfernt man den `depends_on` Eintrag aus der `docker-compose.yml`.

Möchte man den Dienst mitstarten, kann entweder, der Inhalt aus der `docker-compose.yml` in das startscript der anderen `docker-compose.yml` von Nightscout integriert werden.

Alternativ kann der override Mechanismus von docker-compose verwendet werden. Dazu die `CAMAPS` Variable auf den pfad des Repo clones setzen. Dann

```
cd <pfad-zum-cgm-remote-monitor>
CAMAPS=<pfad-zum-repo-clone> docker-compose -f docker-compose.yml -f $CAMAPS/docker-compose.yml up -d
```

## Disclaimer
This project is intended for educational and informational purposes only. It relies on a series of fragile components and assumptions, any of which may break at any time. It is not FDA approved and should not be used to make medical decisions. It is neither affiliated with nor endorsed by diasend / glooko, and may violate their Terms of Service.