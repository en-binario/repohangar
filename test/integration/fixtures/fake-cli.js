// A stand-in for glab and gh in the integration tests: prints the output REPOHANGAR_FAKE_CLI maps the command line to,
// or exits 1 when it maps nothing (not installed, not logged in).
const line = process.argv.slice(2).join(' ');
const outputs = JSON.parse(process.env.REPOHANGAR_FAKE_CLI || '{}');
if (!Object.prototype.hasOwnProperty.call(outputs, line)) process.exit(1);
process.stdout.write(outputs[line]);
