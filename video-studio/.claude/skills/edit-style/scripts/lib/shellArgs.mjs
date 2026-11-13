// Arguments for a command run through the shell (needed on Windows to start npx.cmd): each one is quoted when it holds spaces or shell characters,
// so a path like "C:\Users\me\AppData\Roaming\OmniMotion Studio\jobs\...\plan.json" reaches the program in one piece.
export const shellArgs = (args) =>
  process.platform === 'win32'
    ? args.map((a) => (/[\s"&|<>^()%!]/.test(String(a)) ? `"${String(a).replace(/"/g, '""')}"` : String(a)))
    : args.map((a) => (/[\s'"\$`!&|;<>()*?[\]{}~#]/.test(String(a)) ? `'${String(a).replace(/'/g, `'\''`)}'` : String(a)));
