# ACL app

## Testing using local TPAL installation

- Build bundle: `npm run build`
- Upload bundle and run test: `python ./test-local-tpal.py --bundle dist/bundle.json --add-roles --tpal-tests-directory /path/to/tpal/tests --sandbox-common /path/to/ccf/worspace/sandbox_common/`
  - the `sandbox_common` is likely wherever TPAL was executed.