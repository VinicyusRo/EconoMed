#!/bin/sh
# Copia o site de docs/ para uma pasta pronta para publicar como artefato do Claude.
# Uso: sh scripts/artefato.sh pasta-destino
set -e
DEST="$1"; SRC="$(dirname "$0")/../docs"
rm -rf "$DEST"; mkdir -p "$DEST"
cp -r "$SRC/css" "$SRC/js" "$SRC/data" "$SRC/icone.svg" "$DEST/"
# O artefato já embrulha a página em <html><head><body>: tira essas tags.
sed -e '/<!doctype html>/d' -e '/<html /d' -e '/<\/html>/d' -e '/<head>/d' -e '/<\/head>/d' -e '/<body>/d' -e '/<\/body>/d' \
    -e '/<meta charset/d' -e '/<meta name="viewport"/d' \
    -e 's#<title>.*</title>#<title>EconoMed</title>\n<meta name="claude:viewport-fit-sides" content="cover">#' \
    "$SRC/index.html" > "$DEST/index.html"
