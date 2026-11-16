#!/bin/bash
cd ~; F=~/supabase/volumes/functions/hwchat/index.ts
sudo cp $F $F.before52
sudo python3 ~/HEH-AI-main/server/gateway-update/patch52.py $F
sudo chcon -Rt svirt_sandbox_file_t ~/supabase/volumes/functions
(cd ~/supabase && sudo docker compose up -d --force-recreate functions 2>&1 | tail -1); sleep 8
c=$(curl -s -o /dev/null -w %{http_code} -X POST http://localhost:8000/functions/v1/hwchat -d {})
if [ "$c" = 401 ]; then echo "hwchat running ($c)"; else sudo cp $F.before52 $F; (cd ~/supabase && sudo docker compose up -d --force-recreate functions >/dev/null 2>&1); echo "hwchat DIDN'T START ($c) - old one put back"; fi
echo "== gateway timings (takes about a minute)"; python3 ~/HEH-AI-main/server/gateway-update/timing.py
echo ALL DONE
