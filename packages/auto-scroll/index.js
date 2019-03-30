import * as domUtils from '@interactjs/utils/domUtils';
import * as is from '@interactjs/utils/is';
import raf from '@interactjs/utils/raf';
import { getStringOptionResult } from '@interactjs/utils/rect';
import { getWindow } from '@interactjs/utils/window';
function install(scope) {
    const { interactions, defaults, actions, } = scope;
    scope.autoScroll = autoScroll;
    autoScroll.now = () => scope.now();
    interactions.signals.on('new', ({ interaction }) => {
        interaction.autoScroll = null;
    });
    interactions.signals.on('stop', autoScroll.stop);
    interactions.signals.on('action-move', (arg) => autoScroll.onInteractionMove(arg, scope));
    actions.eventTypes.push('autoscroll');
    defaults.perAction.autoScroll = autoScroll.defaults;
}
const autoScroll = {
    defaults: {
        enabled: false,
        margin: 60,
        // the item that is scrolled (Window or HTMLElement)
        container: null,
        // the scroll speed in pixels per second
        speed: 300,
    },
    now: Date.now,
    interaction: null,
    i: null,
    x: 0,
    y: 0,
    isScrolling: false,
    prevTime: 0,
    margin: 0,
    speed: 0,
    start(interaction, scope) {
        autoScroll.isScrolling = true;
        raf.cancel(autoScroll.i);
        interaction.autoScroll = autoScroll;
        autoScroll.interaction = interaction;
        autoScroll.prevTime = scope.now();
        autoScroll.i = raf.request(autoScroll.scroll);
    },
    stop() {
        autoScroll.isScrolling = false;
        if (autoScroll.interaction) {
            autoScroll.interaction.autoScroll = null;
        }
        raf.cancel(autoScroll.i);
    },
    // scroll the window by the values in scroll.x/y
    scroll() {
        const { interaction } = autoScroll;
        const { interactable, element } = interaction;
        const options = interactable.options[autoScroll.interaction.prepared.name].autoScroll;
        const container = getContainer(options.container, interactable, element);
        const now = this.scope.now();
        // change in time in seconds
        const dt = (now - autoScroll.prevTime) / 1000;
        // displacement
        const s = options.speed * dt;
        if (s >= 1) {
            const scrollBy = {
                x: autoScroll.x * s,
                y: autoScroll.y * s,
            };
            if (scrollBy.x || scrollBy.y) {
                const prevScroll = getScroll(container);
                if (is.window(container)) {
                    container.scrollBy(scrollBy.x, scrollBy.y);
                }
                else if (container) {
                    container.scrollLeft += scrollBy.x;
                    container.scrollTop += scrollBy.y;
                }
                const curScroll = getScroll(container);
                const delta = {
                    x: curScroll.x - prevScroll.x,
                    y: curScroll.y - prevScroll.y,
                };
                if (delta.x || delta.y) {
                    interactable.fire({
                        type: 'autoscroll',
                        target: element,
                        interactable,
                        delta,
                        interaction,
                        container,
                    });
                }
            }
            autoScroll.prevTime = now;
        }
        if (autoScroll.isScrolling) {
            raf.cancel(autoScroll.i);
            autoScroll.i = raf.request(autoScroll.scroll);
        }
    },
    check(interactable, actionName) {
        const options = interactable.options;
        return options[actionName].autoScroll && options[actionName].autoScroll.enabled;
    },
    onInteractionMove({ interaction, pointer }, scope) {
        if (!(interaction.interacting() &&
            autoScroll.check(interaction.interactable, interaction.prepared.name))) {
            return;
        }
        if (interaction.simulation) {
            autoScroll.x = autoScroll.y = 0;
            return;
        }
        let top;
        let right;
        let bottom;
        let left;
        const { interactable, element } = interaction;
        const options = interactable.options[interaction.prepared.name].autoScroll;
        const container = getContainer(options.container, interactable, element);
        if (is.window(container)) {
            left = pointer.clientX < autoScroll.margin;
            top = pointer.clientY < autoScroll.margin;
            right = pointer.clientX > container.innerWidth - autoScroll.margin;
            bottom = pointer.clientY > container.innerHeight - autoScroll.margin;
        }
        else {
            const rect = domUtils.getElementClientRect(container);
            left = pointer.clientX < rect.left + autoScroll.margin;
            top = pointer.clientY < rect.top + autoScroll.margin;
            right = pointer.clientX > rect.right - autoScroll.margin;
            bottom = pointer.clientY > rect.bottom - autoScroll.margin;
        }
        autoScroll.x = (right ? 1 : left ? -1 : 0);
        autoScroll.y = (bottom ? 1 : top ? -1 : 0);
        if (!autoScroll.isScrolling) {
            // set the autoScroll properties to those of the target
            autoScroll.margin = options.margin;
            autoScroll.speed = options.speed;
            autoScroll.start(interaction, scope);
        }
    },
};
export function getContainer(value, interactable, element) {
    return (is.string(value) ? getStringOptionResult(value, interactable, element) : value) || getWindow(element);
}
export function getScroll(container) {
    if (is.window(container)) {
        container = window.document.body;
    }
    return { x: container.scrollLeft, y: container.scrollTop };
}
export function getScrollSize(container) {
    if (is.window(container)) {
        container = window.document.body;
    }
    return { x: container.scrollWidth, y: container.scrollHeight };
}
export function getScrollSizeDelta({ interaction, element }, func) {
    const scrollOptions = interaction && interaction.interactable.options[interaction.prepared.name].autoScroll;
    if (!scrollOptions || !scrollOptions.enabled) {
        func();
        return { x: 0, y: 0 };
    }
    const scrollContainer = getContainer(scrollOptions.container, interaction.interactable, element);
    const prevSize = getScroll(scrollContainer);
    func();
    const curSize = getScroll(scrollContainer);
    return {
        x: curSize.x - prevSize.x,
        y: curSize.y - prevSize.y,
    };
}
export default {
    id: 'auto-scroll',
    install,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUssUUFBUSxNQUFNLDRCQUE0QixDQUFBO0FBQ3RELE9BQU8sS0FBSyxFQUFFLE1BQU0sc0JBQXNCLENBQUE7QUFDMUMsT0FBTyxHQUFHLE1BQU0sdUJBQXVCLENBQUE7QUFDdkMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0JBQXdCLENBQUE7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFBO0FBc0JwRCxTQUFTLE9BQU8sQ0FBRSxLQUFZO0lBQzVCLE1BQU0sRUFDSixZQUFZLEVBQ1osUUFBUSxFQUNSLE9BQU8sR0FDUixHQUFHLEtBQUssQ0FBQTtJQUVULEtBQUssQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFBO0lBQzdCLFVBQVUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFBO0lBRWxDLFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRTtRQUNqRCxXQUFXLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQTtJQUMvQixDQUFDLENBQUMsQ0FBQTtJQUVGLFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUE7SUFFaEQsWUFBWSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUE7SUFFOUYsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUE7SUFDckMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFD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Q3hCLE9BQU8sQ0FDUixDQUFBO0lBRUQsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLGVBQWUsQ0FBQyxDQUFBO0lBQzNDLElBQUksRUFBRSxDQUFBO0lBQ04sTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLGVBQWUsQ0FBQyxDQUFBO0lBRTFDLE9BQU87UUFDTCxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztRQUN6QixDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztLQUMxQixDQUFBO0FBQ0gsQ0FBQztBQUVELGVBQWU7SUFDYixFQUFFLEVBQUUsYUFBYTtJQUNqQixPQUFPO0NBQ1IsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGRvbVV0aWxzIGZyb20gJ0BpbnRlcmFjdGpzL3V0aWxzL2RvbVV0aWxzJ1xuaW1wb3J0ICogYXMgaXMgZnJvbSAnQGludGVyYWN0anMvdXRpbHMvaXMnXG5pbXBvcnQgcmFmIGZyb20gJ0BpbnRlcmFjdGpzL3V0aWxzL3JhZidcbmltcG9ydCB7IGdldFN0cmluZ09wdGlvblJlc3VsdCB9IGZyb20gJ0BpbnRlcmFjdGpzL3V0aWxzL3JlY3QnXG5pbXBvcnQgeyBnZXRXaW5kb3cgfSBmcm9tICdAaW50ZXJhY3Rqcy91dGlscy93aW5kb3cnXG5cbnR5cGUgU2NvcGUgPSBpbXBvcnQgKCdAaW50ZXJhY3Rqcy9jb3JlL3Njb3BlJykuU2NvcGVcblxuZGVjbGFyZSBtb2R1bGUgJ0BpbnRlcmFjdGpzL2NvcmUvc2NvcGUnIHtcbiAgaW50ZXJmYWNlIFNjb3BlIHtcbiAgICBhdXRvU2Nyb2xsOiB0eXBlb2YgYXV0b1Njcm9sbFxuICB9XG59XG5cbmRlY2xhcmUgbW9kdWxlICdAaW50ZXJhY3Rqcy9jb3JlL0ludGVyYWN0aW9uJyB7XG4gIGludGVyZmFjZSBJbnRlcmFjdGlvbiB7XG4gICAgYXV0b1Njcm9sbD86IHR5cGVvZiBhdXRvU2Nyb2xsXG4gIH1cbn1cblxuZGVjbGFyZSBtb2R1bGUgJ0BpbnRlcmFjdGpzL2NvcmUvZGVmYXVsdE9wdGlvbnMnIHtcbiAgaW50ZXJmYWNlIFBlckFjdGlvbkRlZmF1bHRzIHtcbiAgICBhdXRvU2Nyb2xsPzogSW50ZXJhY3QuQXV0b1Njcm9sbE9wdGlvblxuICB9XG59XG5cbmZ1bmN0aW9uIGluc3RhbGwgKHNjb3BlOiBTY29wZSkge1xuICBjb25zdCB7XG4gICAgaW50ZXJhY3Rpb25zLFxuICAgIGRlZmF1bHRzLFxuICAgIGFjdGlvbnMsXG4gIH0gPSBzY29wZVxuXG4gIHNjb3BlLmF1dG9TY3JvbGwgPSBhdXRvU2Nyb2xsXG4gIGF1dG9TY3JvbGwubm93ID0gKCkgPT4gc2NvcGUubm93KClcblxuICBpbnRlcmFjdGlvbnMuc2lnbmFscy5vbignbmV3JywgKHsgaW50ZXJhY3Rpb24gfSkgPT4ge1xuICAgIGludGVyYWN0aW9uLmF1dG9TY3JvbGwgPSBudWxsXG4gIH0pXG5cbiAgaW50ZXJhY3Rpb25zLnNpZ25hbHMub24oJ3N0b3AnLCBhdXRvU2Nyb2xsLnN0b3ApXG5cbiAgaW50ZXJhY3Rpb25zLnNpZ25hbHMub24oJ2FjdGlvbi1tb3ZlJywgKGFyZzogYW55KSA9PiBhdXRvU2Nyb2xsLm9uSW50ZXJhY3Rpb25Nb3ZlKGFyZywgc2NvcGUpKVxuXG4gIGFjdGlvbnMuZXZlbnRUeXBlcy5wdXNoKCdhdXRvc2Nyb2xsJylcbiAgZGVmYXVsdHMucGVyQWN0aW9uLmF1dG9TY3JvbGwgPSBhdXRvU2Nyb2xsLmRlZmF1bHRzXG59XG5cbmNvbnN0IGF1dG9TY3JvbGwgPSB7XG4gIGRlZmF1bHRzOiB7XG4gICAgZW5hYmxlZCAgOiBmYWxzZSxcbiAgICBtYXJnaW4gICA6IDYwLFxuXG4gICAgLy8gdGhlIGl0ZW0gdGhhdCBpcyBzY3JvbGxlZCAoV2luZG93IG9yIEhUTUxFbGVtZW50KVxuICAgIGNvbnRhaW5lcjogbnVsbCBhcyBXaW5kb3cgfCBFbGVtZW50LFxuXG4gICAgLy8gdGhlIHNjcm9sbCBzcGVlZCBpbiBwaXhlbHMgcGVyIHNlY29uZFxuICAgIHNwZWVkICAgIDogMzAwLFxuICB9IGFzIEludGVyYWN0LkF1dG9TY3JvbGxPcHRpb24sXG5cbiAgbm93OiBEYXRlLm5vdyxcblxuICBpbnRlcmFjdGlvbjogbnVsbCxcbiAgaTogbnVsbCwgICAgLy8gdGhlIGhhbmRsZSByZXR1cm5lZCBieSB3aW5kb3cuc2V0SW50ZXJ2YWxcbiAgeDogMCxcbiAgeTogMCwgLy8gRGlyZWN0aW9uIGVhY2ggcHVsc2UgaXMgdG8gc2Nyb2xsIGluXG5cbiAgaXNTY3JvbGxpbmc6IGZhbHNlLFxuICBwcmV2VGltZTogMCxcbiAgbWFyZ2luOiAwLFxuICBzcGVlZDogMCxcblxuICBzdGFydCAoaW50ZXJhY3Rpb246IEludGVyYWN0LkludGVyYWN0aW9uLCBzY29wZTogSW50ZXJhY3QuU2NvcGUpIHtcbiAgICBhdXRvU2Nyb2xsLmlzU2Nyb2xsaW5nID0gdHJ1ZVxuICAgIHJhZi5jYW5jZWwoYXV0b1Njcm9sbC5pKVxuXG4gICAgaW50ZXJhY3Rpb24uYXV0b1Njcm9sbCA9IGF1dG9TY3JvbGxcbiAgICBhdXRvU2Nyb2xsLmludGVyYWN0aW9uID0gaW50ZXJhY3Rpb25cbiAgICBhdXRvU2Nyb2xsLnByZXZUaW1lID0gc2NvcGUubm93KClcbiAgICBhdXRvU2Nyb2xsLmkgPSByYWYucmVxdWVzdChhdXRvU2Nyb2xsLnNjcm9sbClcbiAgfSxcblxuICBzdG9wICgpIHtcbiAgICBhdXRvU2Nyb2xsLmlzU2Nyb2xsaW5nID0gZmFsc2VcbiAgICBpZiAoYXV0b1Njcm9sbC5pbnRlcmFjdGlvbikge1xuICAgICAgYXV0b1Njcm9sbC5pbnRlcmFjdGlvbi5hdXRvU2Nyb2xsID0gbnVsbFxuICAgIH1cbiAgICByYWYuY2FuY2VsKGF1dG9TY3JvbGwuaSlcbiAgfSxcblxuICAvLyBzY3JvbGwgdGhlIHdpbmRvdyBieSB0aGUgdmFsdWVzIGluIHNjcm9sbC54L3lcbiAgc2Nyb2xsICgpIHtcbiAgICBjb25zdCB7IGludGVyYWN0aW9uIH0gPSBhdXRvU2Nyb2xsXG4gICAgY29uc3QgeyBpbnRlcmFjdGFibGUsIGVsZW1lbnQgfSA9IGludGVyYWN0aW9uXG4gICAgY29uc3Qgb3B0aW9ucyA9IGludGVyYWN0YWJsZS5vcHRpb25zW2F1dG9TY3JvbGwuaW50ZXJhY3Rpb24ucHJlcGFyZWQubmFtZV0uYXV0b1Njcm9sbFxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGdldENvbnRhaW5lcihvcHRpb25zLmNvbnRhaW5lciwgaW50ZXJhY3RhYmxlLCBlbGVtZW50KVxuICAgIGNvbnN0IG5vdyA9IHRoaXMuc2NvcGUubm93KClcbiAgICAvLyBjaGFuZ2UgaW4gdGltZSBpbiBzZWNvbmRzXG4gICAgY29uc3QgZHQgPSAobm93IC0gYXV0b1Njcm9sbC5wcmV2VGltZSkgLyAxMDAwXG4gICAgLy8gZGlzcGxhY2VtZW50XG4gICAgY29uc3QgcyA9IG9wdGlvbnMuc3BlZWQgKiBkdFxuXG4gICAgaWYgKHMgPj0gMSkge1xuICAgICAgY29uc3Qgc2Nyb2xsQnkgPSB7XG4gICAgICAgIHg6IGF1dG9TY3JvbGwueCAqIHMsXG4gICAgICAgIHk6IGF1dG9TY3JvbGwueSAqIHMsXG4gICAgICB9XG5cbiAgICAgIGlmIChzY3JvbGxCeS54IHx8IHNjcm9sbEJ5LnkpIHtcbiAgICAgICAgY29uc3QgcHJldlNjcm9sbCA9IGdldFNjcm9sbChjb250YWluZXIpXG5cbiAgICAgICAgaWYgKGlzLndpbmRvdyhjb250YWluZXIpKSB7XG4gICAgICAgICAgY29udGFpbmVyLnNjcm9sbEJ5KHNjcm9sbEJ5LngsIHNjcm9sbEJ5LnkpXG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY29udGFpbmVyKSB7XG4gICAgICAgICAgY29udGFpbmVyLnNjcm9sbExlZnQgKz0gc2Nyb2xsQnkueFxuICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxUb3AgICs9IHNjcm9sbEJ5LnlcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGN1clNjcm9sbCA9IGdldFNjcm9sbChjb250YWluZXIpXG4gICAgICAgIGNvbnN0IGRlbHRhID0ge1xuICAgICAgICAgIHg6IGN1clNjcm9sbC54IC0gcHJldlNjcm9sbC54LFxuICAgICAgICAgIHk6IGN1clNjcm9sbC55IC0gcHJldlNjcm9sbC55LFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlbHRhLnggfHwgZGVsdGEueSkge1xuICAgICAgICAgIGludGVyYWN0YWJsZS5maXJlKHtcbiAgICAgICAgICAgIHR5cGU6ICdhdXRvc2Nyb2xsJyxcbiAgICAgICAgICAgIHRhcmdldDogZWxlbWVudCxcbiAgICAgICAgICAgIGludGVyYWN0YWJsZSxcbiAgICAgICAgICAgIGRlbHRhLFxuICAgICAgICAgICAgaW50ZXJhY3Rpb24sXG4gICAgICAgICAgICBjb250YWluZXIsXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhdXRvU2Nyb2xsLnByZXZUaW1lID0gbm93XG4gICAgfVxuXG4gICAgaWYgKGF1dG9TY3JvbGwuaXNTY3JvbGxpbmcpIHtcbiAgICAgIHJhZi5jYW5jZWwoYXV0b1Njcm9sbC5pKVxuICAgICAgYXV0b1Njcm9sbC5pID0gcmFmLnJlcXVlc3QoYXV0b1Njcm9sbC5zY3JvbGwpXG4gICAgfVxuICB9LFxuICBjaGVjayAoaW50ZXJhY3RhYmxlLCBhY3Rpb25OYW1lKSB7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGludGVyYWN0YWJsZS5vcHRpb25zXG5cbiAgICByZXR1cm4gb3B0aW9uc1thY3Rpb25OYW1lXS5hdXRvU2Nyb2xsICYmIG9wdGlvbnNbYWN0aW9uTmFtZV0uYXV0b1Njcm9sbC5lbmFibGVkXG4gIH0sXG4gIG9uSW50ZXJhY3Rpb25Nb3ZlICh7IGludGVyYWN0aW9uLCBwb2ludGVyIH0sIHNjb3BlOiBJbnRlcmFjdC5TY29wZSkge1xuICAgIGlmICghKGludGVyYWN0aW9uLmludGVyYWN0aW5nKCkgJiZcbiAgICAgICAgICBhdXRvU2Nyb2xsLmNoZWNrKGludGVyYWN0aW9uLmludGVyYWN0YWJsZSwgaW50ZXJhY3Rpb24ucHJlcGFyZWQubmFtZSkpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoaW50ZXJhY3Rpb24uc2ltdWxhdGlvbikge1xuICAgICAgYXV0b1Njcm9sbC54ID0gYXV0b1Njcm9sbC55ID0gMFxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgbGV0IHRvcFxuICAgIGxldCByaWdodFxuICAgIGxldCBib3R0b21cbiAgICBsZXQgbGVmdFxuXG4gICAgY29uc3QgeyBpbnRlcmFjdGFibGUsIGVsZW1lbnQgfSA9IGludGVyYWN0aW9uXG4gICAgY29uc3Qgb3B0aW9ucyA9IGludGVyYWN0YWJsZS5vcHRpb25zW2ludGVyYWN0aW9uLnByZXBhcmVkLm5hbWVdLmF1dG9TY3JvbGxcbiAgICBjb25zdCBjb250YWluZXIgPSBnZXRDb250YWluZXIob3B0aW9ucy5jb250YWluZXIsIGludGVyYWN0YWJsZSwgZWxlbWVudClcblxuICAgIGlmIChpcy53aW5kb3coY29udGFpbmVyKSkge1xuICAgICAgbGVmdCAgID0gcG9pbnRlci5jbGllbnRYIDwgYXV0b1Njcm9sbC5tYXJnaW5cbiAgICAgIHRvcCAgICA9IHBvaW50ZXIuY2xpZW50WSA8IGF1dG9TY3JvbGwubWFyZ2luXG4gICAgICByaWdodCAgPSBwb2ludGVyLmNsaWVudFggPiBjb250YWluZXIuaW5uZXJXaWR0aCAgLSBhdXRvU2Nyb2xsLm1hcmdpblxuICAgICAgYm90dG9tID0gcG9pbnRlci5jbGllbnRZID4gY29udGFpbmVyLmlubmVySGVpZ2h0IC0gYXV0b1Njcm9sbC5tYXJnaW5cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBjb25zdCByZWN0ID0gZG9tVXRpbHMuZ2V0RWxlbWVudENsaWVudFJlY3QoY29udGFpbmVyKVxuXG4gICAgICBsZWZ0ICAgPSBwb2ludGVyLmNsaWVudFggPCByZWN0LmxlZnQgICArIGF1dG9TY3JvbGwubWFyZ2luXG4gICAgICB0b3AgICAgPSBwb2ludGVyLmNsaWVudFkgPCByZWN0LnRvcCAgICArIGF1dG9TY3JvbGwubWFyZ2luXG4gICAgICByaWdodCAgPSBwb2ludGVyLmNsaWVudFggPiByZWN0LnJpZ2h0ICAtIGF1dG9TY3JvbGwubWFyZ2luXG4gICAgICBib3R0b20gPSBwb2ludGVyLmNsaWVudFkgPiByZWN0LmJvdHRvbSAtIGF1dG9TY3JvbGwubWFyZ2luXG4gICAgfVxuXG4gICAgYXV0b1Njcm9sbC54ID0gKHJpZ2h0ID8gMSA6IGxlZnQgPyAtMSA6IDApXG4gICAgYXV0b1Njcm9sbC55ID0gKGJvdHRvbSA/IDEgOiAgdG9wID8gLTEgOiAwKVxuXG4gICAgaWYgKCFhdXRvU2Nyb2xsLmlzU2Nyb2xsaW5nKSB7XG4gICAgICAvLyBzZXQgdGhlIGF1dG9TY3JvbGwgcHJvcGVydGllcyB0byB0aG9zZSBvZiB0aGUgdGFyZ2V0XG4gICAgICBhdXRvU2Nyb2xsLm1hcmdpbiA9IG9wdGlvbnMubWFyZ2luXG4gICAgICBhdXRvU2Nyb2xsLnNwZWVkICA9IG9wdGlvbnMuc3BlZWRcblxuICAgICAgYXV0b1Njcm9sbC5zdGFydChpbnRlcmFjdGlvbiwgc2NvcGUpXG4gICAgfVxuICB9LFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udGFpbmVyICh2YWx1ZSwgaW50ZXJhY3RhYmxlLCBlbGVtZW50KSB7XG4gIHJldHVybiAoaXMuc3RyaW5nKHZhbHVlKSA/IGdldFN0cmluZ09wdGlvblJlc3VsdCh2YWx1ZSwgaW50ZXJhY3RhYmxlLCBlbGVtZW50KSA6IHZhbHVlKSB8fCBnZXRXaW5kb3coZWxlbWVudClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNjcm9sbCAoY29udGFpbmVyKSB7XG4gIGlmIChpcy53aW5kb3coY29udGFpbmVyKSkgeyBjb250YWluZXIgPSB3aW5kb3cuZG9jdW1lbnQuYm9keSB9XG5cbiAgcmV0dXJuIHsgeDogY29udGFpbmVyLnNjcm9sbExlZnQsIHk6IGNvbnRhaW5lci5zY3JvbGxUb3AgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2Nyb2xsU2l6ZSAoY29udGFpbmVyKSB7XG4gIGlmIChpcy53aW5kb3coY29udGFpbmVyKSkgeyBjb250YWluZXIgPSB3aW5kb3cuZG9jdW1lbnQuYm9keSB9XG5cbiAgcmV0dXJuIHsgeDogY29udGFpbmVyLnNjcm9sbFdpZHRoLCB5OiBjb250YWluZXIuc2Nyb2xsSGVpZ2h0IH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNjcm9sbFNpemVEZWx0YSAoeyBpbnRlcmFjdGlvbiwgZWxlbWVudCB9LCBmdW5jKSB7XG4gIGNvbnN0IHNjcm9sbE9wdGlvbnMgPSBpbnRlcmFjdGlvbiAmJiBpbnRlcmFjdGlvbi5pbnRlcmFjdGFibGUub3B0aW9uc1tpbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lXS5hdXRvU2Nyb2xsXG5cbiAgaWYgKCFzY3JvbGxPcHRpb25zIHx8ICFzY3JvbGxPcHRpb25zLmVuYWJsZWQpIHtcbiAgICBmdW5jKClcbiAgICByZXR1cm4geyB4OiAwLCB5OiAwIH1cbiAgfVxuXG4gIGNvbnN0IHNjcm9sbENvbnRhaW5lciA9IGdldENvbnRhaW5lcihcbiAgICBzY3JvbGxPcHRpb25zLmNvbnRhaW5lcixcbiAgICBpbnRlcmFjdGlvbi5pbnRlcmFjdGFibGUsXG4gICAgZWxlbWVudFxuICApXG5cbiAgY29uc3QgcHJldlNpemUgPSBnZXRTY3JvbGwoc2Nyb2xsQ29udGFpbmVyKVxuICBmdW5jKClcbiAgY29uc3QgY3VyU2l6ZSA9IGdldFNjcm9sbChzY3JvbGxDb250YWluZXIpXG5cbiAgcmV0dXJuIHtcbiAgICB4OiBjdXJTaXplLnggLSBwcmV2U2l6ZS54LFxuICAgIHk6IGN1clNpemUueSAtIHByZXZTaXplLnksXG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQge1xuICBpZDogJ2F1dG8tc2Nyb2xsJyxcbiAgaW5zdGFsbCxcbn1cbiJdfQ==