#!/bin/bash
# deploy.sh — laddar upp BARA ändrade kodfiler/bilder till hedin.it/el3d/
# (lftp put per fil över SFTP; aldrig mirror -R --delete, aldrig datamappar).
# Kör från repots rot: ./deploy.sh   — verifierar efteråt med cmp mot live.
set -euo pipefail
cd "$(dirname "$0")"
URLDIR="el3d"
WEBROT="site"     # lokal webbrot relativt repot
FILES=(
  "index.html"
  "app.js"
)
SFTP='set sftp:connect-program "ssh -a -x -i /Users/bjornh/.ssh/hedin_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes"; open -u bjornh, sftp://hedin.it:22'
CMDS="$SFTP"
for f in "${FILES[@]}"; do
  d=$(dirname "$f")
  if [ "$d" = "." ]; then mal="public_html/$URLDIR"; else mal="public_html/$URLDIR/$d"; fi
  CMDS="$CMDS; mkdir -p -f $mal; put -O $mal $WEBROT/$f"
done
lftp -c "$CMDS"
fel=0
for f in "${FILES[@]}"; do
  if cmp -s <(curl -s "https://hedin.it/$URLDIR/$f?nocache=$RANDOM") "$WEBROT/$f"; then
    echo "OK   $f"
  else
    echo "FEL  $f skiljer sig från live"; fel=1
  fi
done
exit $fel
