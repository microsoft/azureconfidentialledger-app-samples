{
  "metadata": {
    "endpoints": {
      "/content": {
        "get": {
          "js_module": "test.js",
          "js_function": "content",
          "forwarding_required": "never",
          "redirection_strategy": "none",
          "authn_policies": ["no_auth"],
          "mode": "readonly",
          "openapi": {}
        }
      }
    }
  },
  "modules": [
    {
      "name": "test.js",
      "module": "import { foo } from \"./baz/baz.js\";\n\nexport function content(request) {\n  return {\n    statusCode: 200,\n    body: { payload: foo() },\n  };\n}"
    },
    {
      "name": "baz/baz.js",
      "module": "export function foo() {\n  return \"Test content\";\n}"
    }
  ]
}
