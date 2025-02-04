from llama_cpp import Llama
import json
import itertools

preamble = """
<|system|>
You are an insurance claim assessor, assessing independent and separate claims.
Each claim will be provided by the user and include the incident and their current policy.
Your output must be valid json surrounded by <result></result> tags, giving one of two valid decisions and no other output:
<result>{"result": "approve"}</result>
or
<result>{"result": "deny"}</result>
<|end|>

<|user|>
{"incident": "While driving home during a rainstorm, the policyholder's car skidded off the road and hit a utility pole. The impact caused significant damage to the front bumper and the car's electrical system. The incident happened in the evening when visibility was poor.", "policy": "This policy provides coverage for damages from accidents, vandalism and unforseen events. Exclusions include natural disasters and intentional or illegal actions."}<|end|>
<|assessor|>
<result>{"result": "approve"}</result><|end|>

<|user|>
{"incident": "The policyholder drove through a flooded street during a hurricane and the car's engine suffered water damage.", "policy": "This policy covers accidential damage to the insured vehicle. Exclusions include natural disasters."}<|end|>
<|assessor|>
<result>{"result": "deny"}</result><|end|>

<|user|>
{"incident": "While reversing out of a parking space, the policyholder accidentially hit another car, causing minor scratches to both vehicles.", "policy": "This policy covers damage from accidents, but excludes intentional acts."}<|end|>
<|assessor|>
<result>{"result": "approve"}</result><|end|>

<|user|>
{"incident": "The policyholder drove through a flooded street despite warnings and the car's engine suffered severe water damage. The incident occurred during heavy rainfall.", "policy": "This policy covers damages to the insured vehicle from natural disasters. Exclusions include intentional damage."}<|end|>
<|assessor|>
<result>{"result": "deny"}</result><|end|>
"""


class Phi:
    def __init__(self, model_path="./Phi-3-mini-4k-instruct-q4.gguf"):
        self.llm = Llama(
            model_path=model_path,
            n_ctx=1024,
        )

    def process_incident(self, incident, policy, repeats=1) -> str:
        prompt = (
            preamble
            + f'\n<|user|>\n{{"incident": "{incident}", "policy": "{policy}"}}<|end|>\n<|accessor|>'
        )

        for _ in range(repeats) if repeats is not None else itertools.cycle([1]):
            result = self.llm.create_completion(
                prompt, max_tokens=100, stop=["<|end|>", "</result>"]
            )
            print(result, flush=True)

            try:
                result = result["choices"][0]["text"]
                result = json.loads(result.split("<result>")[1])
                if "result" not in result:
                    continue
                if result["result"].lower() not in {"approve", "deny"}:
                    continue
                return result["result"].lower()
            except Exception as e:
                print(e)
                continue
        return "error"
