from llama_cpp import Llama
import json

llm = Llama(
    model_path="./Phi-3-mini-4k-instruct-q4.gguf",
    n_ctx=1024
)

policy = "This policy provides comprehensive coverage for damages to the insured vehicle resulting from accidents, theft, vandalism, natural disasters, and other unforeseen events. Coverage includes damages to the body, engine, and other essential parts of the vehicle. Claims must be reported promptly, and the policyholder must cooperate with the insurer's investigation and claims process. Exclusions to this policy include damages resulting from intentional acts, driving under the influence of alcohol or drugs, and using the vehicle for illegal activities."

sample_claims = [ 
  { 
    "incident": "While driving home during a rainstorm, the policyholder's car skidded off the road and hit a utility pole. The impact caused significant damage to the front bumper and the car's electrical system. The incident happened in the evening when visibility was poor.", 
    "policy": "This policy provides coverage for damages from accidents, vandalism and unforseen events. Exclusions include natural disasters and intentional or illegal actions.",
    "decision": "approve"
  },
  { 
    "incident": "The policyholder drove through a flooded street during a hurricane and the car's engine suffered water damage.", 
    "policy": "This policy covers accidential damage to the insured vehicle. Exclusions include natural disasters.",
    "decision": "deny"
  },
  { 
    "incident": "While reversing out of a parking space, the policyholder accidentially hit another car, causing minor scratches to both vehicles.",
    "policy": "This policy covers damage from accidents, but excludes intentional acts.",
    "decision": "approve"
  },
  { 
    "incident": "The policyholder drove through a flooded street despite warnings and the car's engine suffered severe water damage. The incident occurred during heavy rainfall.", 
    "policy": "This policy covers damages to the insured vehicle from natural disasters. Exclusions include intentional damage.",
    "decision": "deny"
  }
]

preamble = '''
<|system|>
You are an insurance claim assessor, assessing independent and separate claims.
Each claim will be provided by the user and include the incident and their current policy.
Your output must be valid json surrounded by <result></result> tags, giving one of two valid decisions and no other output:
<result>{"result": "approve"}</result>
or
<result>{"result": "deny"}</result>
<|end|>
''' + "\n".join(
  f'''
<|user|>
{{"incident": "{claim['incident']}", "policy": "{claim['policy']}"}}<|end|>
<|assessor|>
<result>{{"result": "{claim['decision']}"}}</result><|end|>'''
  for claim in sample_claims
)

def format_prompt(incident, policy): 
   return preamble + "\n" f'''
<|user|>
{{"incident": "{incident}", "policy": "{policy}"}}<|end|>
<|assessor|>
'''

def process_incident(incident, policy):
  prompt = format_prompt(incident, policy)

  result = None
  while True:
      result = llm.create_completion(prompt, max_tokens=100, stop=['<|end|>', '</result>'])
      print(result)
      try:
          result = result['choices'][0]['text']
          result = json.loads(result.split('<result>')[1])
          if "result" not in result:
            continue
          if result["result"].lower() not in {"approve", "deny"}:
            continue
          return result["result"].lower()
      except Exception as e:
          print(e)
          continue