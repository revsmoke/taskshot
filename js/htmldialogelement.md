HTMLDialogElement
​
 Summarize
​
The HTMLDialogElement interface provides methods to manipulate <dialog> elements. It inherits properties and methods from the HTMLElement interface.

Also inherits events from its parent interface, HTMLElement.

Listen to these events using addEventListener() or by assigning an event listener to the oneventname property of this interface.

cancel
Fired when the user dismisses the current open dialog with the escape key.

close
Fired when the dialog is closed, whether with the escape key, the HTMLDialogElement.close() method, or via submitting a form within the dialog with method="dialog".

The following example shows a button that, when clicked, uses the HTMLDialogElement.showModal() function to open a modal <dialog> containing a form.

While open, everything other than the modal dialog's contents is inert. You can click the Cancel button to close the dialog (via the HTMLDialogElement.close() function), or submit the form via the Confirm button.

The example demonstrates how you might use all the "state change" events that can be fired on the dialog: cancel and close, and the inherited events beforetoggle, and toggle.

HTML

html


<dialog id="favDialog">
  <form method="dialog">
    <p>
      <label for="favAnimal">Favorite animal:</label>
      <select id="favAnimal" name="favAnimal">
        <option></option>
        <option>Brine shrimp</option>
        <option>Red panda</option>
        <option>Spider monkey</option>
      </select>
    </p>
    <div>
      <button id="cancel" type="reset">Cancel</button>
      <button id="submit" type="submit">Confirm</button>
    </div>
  </form>
</dialog>

<div>
  <button id="updateDetails">Update details</button>
</div>
JavaScript

Showing the dialog

The code first gets objects for the <button> elements, the <dialog> element, and the <select> element. It then adds a listener to call the HTMLDialogElement.showModal() function when the Update button is clicked.

js

const updateButton = document.getElementById("updateDetails");
const confirmButton = document.getElementById("submit");
const cancelButton = document.getElementById("cancel");
const dialog = document.getElementById("favDialog");
const selectElement = document.getElementById("favAnimal");


updateButton.addEventListener("click", () => {
  dialog.showModal();
});
Cancel and confirm buttons

Next we add listeners to the Confirm and Cancel button click events. The handlers call HTMLDialogElement.close() with the selection value (if present) and no value, which in turn set the return value of the dialog (HTMLDialogElement.returnValue) to the selection value and null, respectively.

js


confirmButton.addEventListener("click", () => {
  if (selectElement.value) {
    
    dialog.close(selectElement.value);
  }
});


cancelButton.addEventListener("click", () => {
  dialog.close(); 
});
Calling close() also fires the close event, which we implement below by logging the return value of the dialog. If the Confirm button was clicked this should be the selected value in the dialog, otherwise it should be null.

js

dialog.addEventListener("close", (event) => {
  log(`close_event: (dialog.returnValue: "${dialog.returnValue}")`);
});
Cancel event

The cancel event is fired when "platform specific methods" are used to close the dialog, such as the Esc key. The event is "cancelable" which means that we could use it to prevent the dialog from closing. Here we just treat the cancel as a "close" operation, and reset the HTMLDialogElement.returnValue to "" to clear any value that may have been set.

js

dialog.addEventListener("cancel", (event) => {
  log(`cancel_event: (dialog.returnValue: "${dialog.returnValue}")`);
  dialog.returnValue = ""; 
});
Toggle event

The toggle event (inherited from HTMLElement) is fired just after a dialog has opened or closed (but before the closed event).

Here we add a listener to log when the Dialog opens and closes.

Note: The toggle and beforetoggle events may not be fired at dialog elements on all browsers. On these browser versions you can instead check the HTMLDialogElement.open property after attempting to open/close the dialog.

js

dialog.addEventListener("toggle", (event) => {
  log(`toggle_event: Dialog ${event.newState}`);
});
Beforetoggle event

The beforetoggle event (inherited from HTMLElement) is a cancellable event that is fired just before a dialog is opened or closed. If needed, this can be used to prevent a dialog from showing, or to perform actions on other elements that are affected by the dialog open/close state, such as adding classes on them to trigger animations.

In this case we just log the old and new state.

js

dialog.addEventListener("beforetoggle", (event) => {
  log(
    `beforetoggle event: oldstate: ${event.oldState}, newState: ${event.newState}`,
  );

  
  
});
Result

Try out the example below. Note that both Confirm and Cancel buttons result in the close event being fired, and that the result should reflect the selected dialog option.

Specification
HTML
# htmldialogelement
HTML
# event-beforetoggle
HTML
# event-toggle
Report problems with this compatibility data on GitHub
Tip: you can click/tap on a cell for more information.

Full support

In development. Supported in a pre-release version.

No support

Experimental. Expect behavior to change in the future.

Report problems with this compatibility data on GitHub
Tip: you can click/tap on a cell for more information.

Full support

In development. Supported in a pre-release version.

No support

Report problems with this compatibility data on GitHub
Tip: you can click/tap on a cell for more information.

Full support

In development. Supported in a pre-release version.

No support