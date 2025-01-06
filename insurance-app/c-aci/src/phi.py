from llama_cpp import Llama
import json

llm = Llama(
    model_path="./Phi-3-mini-4k-instruct-q4.gguf",
)

def process_incident(incident, policy):
  prompt = "TODO".format(incident, policy)

  output = llm(prompt, max_tokens=10, stop=["<|end|>"])
  return output["choices"][0]["text"]