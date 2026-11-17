const dialogs = [...document.querySelectorAll('dialog')];
let opener = null;

function closeDialog(dialog) {
  dialog.close();
}

document.querySelectorAll('[data-open]').forEach(button => {
  button.addEventListener('click', () => {
    const dialog = document.getElementById(button.dataset.open);
    if (!dialog || dialog.open) return;
    opener = button;
    dialog.showModal();
  });
});

dialogs.forEach(dialog => {
  dialog.querySelector('[data-close]').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
  });
  dialog.addEventListener('close', () => {
    opener?.focus({preventScroll: true});
    opener = null;
  });
});

document.querySelector('[data-home]').addEventListener('click', () => {
  dialogs.filter(dialog => dialog.open).forEach(closeDialog);
});
