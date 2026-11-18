document.querySelectorAll('[data-open]').forEach(button => {
  const dialog = document.getElementById(button.dataset.open);
  if (!(dialog instanceof HTMLDialogElement)) return;
  button.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
});

document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
