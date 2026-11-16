# Times Gaurav's gateway: first word and full answer, streaming, per model. Prints no keys.
import json, os, re, time, urllib.request, statistics, datetime
env = open(os.path.expanduser("~/supabase/.env")).read()
get = lambda k: (re.search(r"^%s=(.*)$" % k, env, re.M) or [None, ""])[1].strip().strip('"')
KEY = get("LAUNCHPAD_LLM_KEY"); _fn = open(os.path.expanduser("~/supabase/volumes/functions/hwchat/index.ts")).read() if os.path.exists(os.path.expanduser("~/supabase/volumes/functions/hwchat/index.ts")) else ""
_m = re.search(r'GCP_LLM = .*?"(https://[^"]+)"', _fn)
URL = (get("LAUNCHPAD_LLM_URL") or (_m.group(1) if _m else "")).rstrip("/")
if not URL: raise SystemExit("can't find the gateway address")
if not KEY: raise SystemExit("no LAUNCHPAD_LLM_KEY in .env")
QS = ["Which planet is closest to the Sun? One sentence.",
      "Which university in Coventry has a business school called WBS? One sentence.",
      "Explain photosynthesis in three sentences for a Year 7 pupil."]
MODELS = [("gpt-oss-120b", {"reasoning_effort": "medium"}), ("gemma-4-26b", {}), ("glm-5.2", {}), ("deepseek-v4.1-flash", {})]
rows = []
for model, extra in MODELS:
    for q in QS:
        body = {"model": model, "stream": True, "max_tokens": 600, "messages": [{"role": "system", "content": "Answer briefly. If you're not sure, say so."}, {"role": "user", "content": q}], **extra}
        rq = urllib.request.Request(URL + "/chat/completions", data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + KEY, "content-type": "application/json"})
        t0 = time.time(); first = word = None; text = ""; err = ""
        try:
            with urllib.request.urlopen(rq, timeout=120) as r:
                for line in r:
                    if first is None: first = time.time() - t0
                    line = line.decode("utf-8", "ignore").strip()
                    if not line.startswith("data:") or line.endswith("[DONE]"): continue
                    try: d = (json.loads(line[5:])["choices"] or [{}])[0].get("delta", {})
                    except Exception: continue
                    c = d.get("content") or ""
                    if c and word is None: word = time.time() - t0
                    text += c
        except Exception as e: err = type(e).__name__ + ": " + str(e)[:80]
        total = time.time() - t0
        rows.append((model, q[:28], first, word, total, re.sub(r"\s+", " ", text)[:70] or err))
        time.sleep(1)
f = lambda x: "  -  " if x is None else "%5.1fs" % x
print("%-20s %-29s %7s %7s %7s  %s" % ("model", "question", "byte1", "word1", "total", "answer"))
for r in rows: print("%-20s %-29s %7s %7s %7s  %s" % (r[0], r[1], f(r[2]), f(r[3]), f(r[4]), r[5]))
for m, _ in MODELS:
    w = [r[3] for r in rows if r[0] == m and r[3] is not None]; t = [r[4] for r in rows if r[0] == m]
    print("%-20s first word median %s, total median %s" % (m, f(statistics.median(w)) if w else "  -  ", f(statistics.median(t))))
out = os.path.expanduser("~/gateway-timings-%s.csv" % datetime.datetime.utcnow().strftime("%Y%m%d-%H%M"))
with open(out, "w") as fh:
    fh.write("model,question,first_byte_s,first_word_s,total_s,answer\n")
    for r in rows: fh.write('%s,"%s",%s,%s,%.2f,"%s"\n' % (r[0], r[1], "" if r[2] is None else "%.2f" % r[2], "" if r[3] is None else "%.2f" % r[3], r[4], r[5].replace('"', "'")))
print("saved", out)
