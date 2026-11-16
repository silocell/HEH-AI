import sys; p=sys.argv[1]; s=open(p).read(); log=[]
def rep(a,b,n=1,what=""):
    global s
    c=s.count(a)
    if c==0 and b in s: log.append(what+": already done"); return
    if c!=n: log.append(what+f": SKIPPED (found {c}, expected {n})"); return
    s=s.replace(a,b); log.append(what+": changed")
import re
# 1. gateway: longer time, new models
m=re.search(r'  gcp: \{ ms: \d+, url: `\$\{GCP_LLM\}/chat/completions`, list: `\$\{GCP_LLM\}/models`, keys: \["LAUNCHPAD_LLM_KEY"\], fixed: \[[^\]]*\] \},',s)
if m: s=s.replace(m.group(0),'  gcp: { ms: 60000, url: `${GCP_LLM}/chat/completions`, list: `${GCP_LLM}/models`, keys: ["LAUNCHPAD_LLM_KEY"], fixed: ["gpt-oss-120b", "gemma-4-26b", "glm-5.2", "deepseek-v4.1-flash"] },'); log.append("gateway models + time: changed")
else: log.append("gateway models + time: SKIPPED")
rep('// gpt-oss-120b on Google Cloud (us-central1), through the gateway Gaurav runs; pay per use','// gpt-oss-120b (+ gemma, glm, deepseek) on Google Cloud (global endpoint), through the gateway Gaurav runs; pay per use',1,"comment")
# 2. reasoning medium on the gateway (Gaurav's advice), low elsewhere
rep('if (/gpt-oss/.test(model) && (name === "groq" || name === "cerebras" || name === "gcp")) body.reasoning_effort = "low";',
    'if (/gpt-oss/.test(model) && (name === "groq" || name === "cerebras" || name === "gcp")) body.reasoning_effort = name === "gcp" ? "medium" : "low";',2,"reasoning medium")
# 3. stronger "say when unsure"
rep("- If you're not sure of a fact, say so. You can't browse",
    "- If you're not sure of a fact, say so plainly (for example \"I'm not sure, but...\"). Never make up names, dates, numbers, quotes, places or sources: saying you don't know is better than guessing. You can't browse",1,"unsure line")
# 4. picker: these models come from the gateway first
rep('chain: [["google", [/gemma-4-31b/, /gemma-4/]], ["nvidia", [/gemma-4/]]','chain: [["gcp", [/^gemma-4-26b/]], ["google", [/gemma-4-31b/, /gemma-4/]], ["nvidia", [/gemma-4/]]',1,"Gemma via gateway")
rep('chain: [["nvidia", [/deepseek-v4\\.1/, /deepseek-v4/]], ["sambanova"','chain: [["gcp", [/^deepseek-v4\\.1-flash$/]], ["nvidia", [/deepseek-v4\\.1/, /deepseek-v4/]], ["sambanova"',1,"DeepSeek via gateway")
rep('chain: [["nvidia", [/glm-5[.-]3/, /glm-5/]], ["zai"','chain: [["gcp", [/^glm-5\\.2$/]], ["nvidia", [/glm-5[.-]3/, /glm-5/]], ["zai"',1,"GLM via gateway")
# 5. only gpt-oss on the gateway is called "Launchpad AI"; the others show their own name
rep('const by = name === "gcp" ? "Launchpad AI" : friendly(got.model ?? m);','const by = name === "gcp" && /gpt-oss/.test(m) ? "Launchpad AI" : friendly(got.model ?? m);',1,"label (stream)")
rep('if (t) return { text: t.text, by: name === "gcp" ? "Launchpad AI" : friendly(t.model) };','if (t) return { text: t.text, by: name === "gcp" && /gpt-oss/.test(m) ? "Launchpad AI" : friendly(t.model) };',1,"label (whole)")
open(p,"w").write(s); print("\n".join(log))
