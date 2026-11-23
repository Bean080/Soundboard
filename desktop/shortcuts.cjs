function acceleratorFor(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
  return null;
}

function registerBindings(globalShortcut, bindings, trigger) {
  globalShortcut.unregisterAll();
  const failed = [];
  for (const { id, code } of bindings) {
    const accelerator = acceleratorFor(code);
    try {
      if (!accelerator || !globalShortcut.register(accelerator, () => trigger(id))) failed.push(code);
    } catch {
      failed.push(code);
    }
  }
  return failed;
}

module.exports = { acceleratorFor, registerBindings };
