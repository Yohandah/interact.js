import { EventPhase } from '@interactjs/core/InteractEvent';
import modifiers from '@interactjs/modifiers/base';
import * as utils from '@interactjs/utils';
import raf from '@interactjs/utils/raf';
EventPhase.Resume = 'resume';
EventPhase.InertiaStart = 'inertiastart';
function install(scope) {
    const { interactions, defaults, } = scope;
    interactions.signals.on('new', ({ interaction }) => {
        interaction.inertia = {
            active: false,
            smoothEnd: false,
            allowResume: false,
            upCoords: {},
            timeout: null,
        };
    });
    // FIXME proper signal typing
    interactions.signals.on('before-action-end', (arg) => release(arg, scope));
    interactions.signals.on('down', (arg) => resume(arg, scope));
    interactions.signals.on('stop', (arg) => stop(arg));
    defaults.perAction.inertia = {
        enabled: false,
        resistance: 10,
        minSpeed: 100,
        endSpeed: 10,
        allowResume: true,
        smoothEndDuration: 300,
    };
    scope.usePlugin(modifiers);
}
function resume({ interaction, event, pointer, eventTarget }, scope) {
    const state = interaction.inertia;
    // Check if the down event hits the current inertia target
    if (state.active) {
        let element = eventTarget;
        // climb up the DOM tree from the event target
        while (utils.is.element(element)) {
            // if interaction element is the current inertia target element
            if (element === interaction.element) {
                // stop inertia
                raf.cancel(state.timeout);
                state.active = false;
                interaction.simulation = null;
                // update pointers to the down event's coordinates
                interaction.updatePointer(pointer, event, eventTarget, true);
                utils.pointer.setCoords(interaction.coords.cur, interaction.pointers.map((p) => p.pointer), interaction._now());
                // fire appropriate signals
                const signalArg = {
                    interaction,
                };
                scope.interactions.signals.fire('action-resume', signalArg);
                // fire a reume event
                const resumeEvent = new scope.InteractEvent(interaction, event, interaction.prepared.name, EventPhase.Resume, interaction.element);
                interaction._fireEvent(resumeEvent);
                utils.pointer.copyCoords(interaction.coords.prev, interaction.coords.cur);
                break;
            }
            element = utils.dom.parentNode(element);
        }
    }
}
function release({ interaction, event, noPreEnd }, scope) {
    const state = interaction.inertia;
    if (!interaction.interacting() ||
        (interaction.simulation && interaction.simulation.active) ||
        noPreEnd) {
        return null;
    }
    const options = getOptions(interaction);
    const now = interaction._now();
    const { client: velocityClient } = interaction.coords.velocity;
    const pointerSpeed = utils.hypot(velocityClient.x, velocityClient.y);
    let smoothEnd = false;
    let modifierResult;
    // check if inertia should be started
    const inertiaPossible = (options && options.enabled &&
        interaction.prepared.name !== 'gesture' &&
        event !== state.startEvent);
    const inertia = (inertiaPossible &&
        (now - interaction.coords.cur.timeStamp) < 50 &&
        pointerSpeed > options.minSpeed &&
        pointerSpeed > options.endSpeed);
    const modifierArg = {
        interaction,
        pageCoords: utils.extend({}, interaction.coords.cur.page),
        states: inertiaPossible && interaction.modifiers.states.map((modifierStatus) => utils.extend({}, modifierStatus)),
        preEnd: true,
        prevCoords: undefined,
        requireEndOnly: null,
    };
    // smoothEnd
    if (inertiaPossible && !inertia) {
        modifierArg.prevCoords = interaction.prevEvent.page;
        modifierArg.requireEndOnly = false;
        modifierResult = modifiers.setAll(modifierArg);
        if (modifierResult.changed) {
            smoothEnd = true;
        }
    }
    if (!(inertia || smoothEnd)) {
        return null;
    }
    utils.pointer.copyCoords(state.upCoords, interaction.coords.cur);
    interaction.pointers[0].pointer = state.startEvent = new scope.InteractEvent(interaction, event, 
    // FIXME add proper typing Action.name
    interaction.prepared.name, EventPhase.InertiaStart, interaction.element);
    state.t0 = now;
    state.active = true;
    state.allowResume = options.allowResume;
    interaction.simulation = state;
    interaction.interactable.fire(state.startEvent);
    if (inertia) {
        state.vx0 = interaction.coords.velocity.client.x;
        state.vy0 = interaction.coords.velocity.client.y;
        state.v0 = pointerSpeed;
        calcInertia(interaction, state);
        utils.extend(modifierArg.pageCoords, interaction.coords.cur.page);
        modifierArg.pageCoords.x += state.xe;
        modifierArg.pageCoords.y += state.ye;
        modifierArg.prevCoords = undefined;
        modifierArg.requireEndOnly = true;
        modifierResult = modifiers.setAll(modifierArg);
        state.modifiedXe += modifierResult.delta.x;
        state.modifiedYe += modifierResult.delta.y;
        state.timeout = raf.request(() => inertiaTick(interaction));
    }
    else {
        state.smoothEnd = true;
        state.xe = modifierResult.delta.x;
        state.ye = modifierResult.delta.y;
        state.sx = state.sy = 0;
        state.timeout = raf.request(() => smothEndTick(interaction));
    }
    return false;
}
function stop({ interaction }) {
    const state = interaction.inertia;
    if (state.active) {
        raf.cancel(state.timeout);
        state.active = false;
        interaction.simulation = null;
    }
}
function calcInertia(interaction, state) {
    const options = getOptions(interaction);
    const lambda = options.resistance;
    const inertiaDur = -Math.log(options.endSpeed / state.v0) / lambda;
    state.x0 = interaction.prevEvent.page.x;
    state.y0 = interaction.prevEvent.page.y;
    state.t0 = state.startEvent.timeStamp / 1000;
    state.sx = state.sy = 0;
    state.modifiedXe = state.xe = (state.vx0 - inertiaDur) / lambda;
    state.modifiedYe = state.ye = (state.vy0 - inertiaDur) / lambda;
    state.te = inertiaDur;
    state.lambda_v0 = lambda / state.v0;
    state.one_ve_v0 = 1 - options.endSpeed / state.v0;
}
function inertiaTick(interaction) {
    updateInertiaCoords(interaction);
    utils.pointer.setCoordDeltas(interaction.coords.delta, interaction.coords.prev, interaction.coords.cur);
    utils.pointer.setCoordVelocity(interaction.coords.velocity, interaction.coords.delta);
    const state = interaction.inertia;
    const options = getOptions(interaction);
    const lambda = options.resistance;
    const t = interaction._now() / 1000 - state.t0;
    if (t < state.te) {
        const progress = 1 - (Math.exp(-lambda * t) - state.lambda_v0) / state.one_ve_v0;
        if (state.modifiedXe === state.xe && state.modifiedYe === state.ye) {
            state.sx = state.xe * progress;
            state.sy = state.ye * progress;
        }
        else {
            const quadPoint = utils.getQuadraticCurvePoint(0, 0, state.xe, state.ye, state.modifiedXe, state.modifiedYe, progress);
            state.sx = quadPoint.x;
            state.sy = quadPoint.y;
        }
        interaction.move();
        state.timeout = raf.request(() => inertiaTick(interaction));
    }
    else {
        state.sx = state.modifiedXe;
        state.sy = state.modifiedYe;
        interaction.move();
        interaction.end(state.startEvent);
        state.active = false;
        interaction.simulation = null;
    }
    utils.pointer.copyCoords(interaction.coords.prev, interaction.coords.cur);
}
function smothEndTick(interaction) {
    updateInertiaCoords(interaction);
    const state = interaction.inertia;
    const t = interaction._now() - state.t0;
    const { smoothEndDuration: duration } = getOptions(interaction);
    if (t < duration) {
        state.sx = utils.easeOutQuad(t, 0, state.xe, duration);
        state.sy = utils.easeOutQuad(t, 0, state.ye, duration);
        interaction.move();
        state.timeout = raf.request(() => smothEndTick(interaction));
    }
    else {
        state.sx = state.xe;
        state.sy = state.ye;
        interaction.move();
        interaction.end(state.startEvent);
        state.smoothEnd =
            state.active = false;
        interaction.simulation = null;
    }
}
function updateInertiaCoords(interaction) {
    const state = interaction.inertia;
    // return if inertia isn't running
    if (!state.active) {
        return;
    }
    const pageUp = state.upCoords.page;
    const clientUp = state.upCoords.client;
    utils.pointer.setCoords(interaction.coords.cur, [{
            pageX: pageUp.x + state.sx,
            pageY: pageUp.y + state.sy,
            clientX: clientUp.x + state.sx,
            clientY: clientUp.y + state.sy,
        }], interaction._now());
}
function getOptions({ interactable, prepared }) {
    return interactable &&
        interactable.options &&
        prepared.name &&
        interactable.options[prepared.name].inertia;
}
export default {
    id: 'inertia',
    install,
    calcInertia,
    inertiaTick,
    smothEndTick,
    updateInertiaCoords,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0NBQWdDLENBQUE7QUFDM0QsT0FBTyxTQUFTLE1BQU0sNEJBQTRCLENBQUE7QUFDbEQsT0FBTyxLQUFLLEtBQUssTUFBTSxtQkFBbUIsQ0FBQTtBQUMxQyxPQUFPLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQTtBQTBEdEMsVUFBa0IsQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDO0FBQ3JDLFVBQWtCLENBQUMsWUFBWSxHQUFHLGNBQWMsQ0FBQTtBQUVqRCxTQUFTLE9BQU8sQ0FBRSxLQUFxQjtJQUNyQyxNQUFNLEVBQ0osWUFBWSxFQUNaLFFBQVEsR0FDVCxHQUFHLEtBQUssQ0FBQTtJQUVULFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRTtRQUNqRCxXQUFXLENBQUMsT0FBTyxHQUFHO1lBQ3BCLE1BQU0sRUFBTyxLQUFLO1lBQ2xCLFNBQVMsRUFBSSxLQUFLO1lBQ2xCLFdBQVcsRUFBRSxLQUFLO1lBQ2xCLFFBQVEsRUFBSyxFQUFTO1lBQ3RCLE9BQU8sRUFBTSxJQUFJO1NBQ2xCLENBQUE7SUFDSCxDQUFDLENBQUMsQ0FBQTtJQUVGLDZCQUE2QjtJQUM3QixZQUFZLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEdBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFBO0lBQ2pGLFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLEdBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFBO0lBQ25FLFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQVUsQ0FBQyxDQUFDLENBQUE7SUFFMUQsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEdBQUc7UUFDM0IsT0FBTyxFQUFZLEtBQUs7UUFDeEIsVUFBVSxFQUFTLEVBQUU7UUFDckIsUUFBUSxFQUFXLEdBQUc7UUFDdEIsUUFBUSxFQUFXLEVBQUU7UUFDckIsV0FBVyxFQUFRLElBQUk7UUFDdkIsaUJBQWlCLEVBQUUsR0FBRztLQUN2QixDQUFBO0lBRUQsS0FBSyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQTtBQUM1QixDQUFDO0FBRUQsU0FBUyxNQUFNLENBQ2IsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQXNCLEVBQ2hFLEtBQXFCO0lBRXJCLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUE7SUFFakMsMERBQTBEO0lBQzFELElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRTtRQUNoQixJQUFJLE9BQU8sR0FBRyxXQUFXLENBQUE7UUFFekIsOENBQThDO1FBQzlDLE9BQU8sS0FBSyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDaEMsK0RBQStEO1lBQy9ELElBQUksT0FBTyxLQUFLLFdBQVcsQ0FBQyxPQUFPLEVBQUU7Z0JBQ25DLGVBQWU7Z0JBQ2YsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ3pCLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFBO2dCQUNwQixXQUFXLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQTtnQkFFN0Isa0RBQWtEO2dCQUNsRCxXQUFXLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFBO2dCQUM1RCxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FDckIsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQ3RCLFdBQVcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQzFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FDbkIsQ0FBQTtnQkFFRCwyQkFBMkI7Z0JBQzNCLE1BQU0sU0FBUyxHQUFHO29CQUNoQixXQUFXO2lCQUNaLENBQUE7Z0JBRUQsS0FBSyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxTQUFTLENBQUMsQ0FBQTtnQkFFM0QscUJBQXFCO2dCQUNyQixNQUFNLFdBQVcsR0FBRyxJQUFJLEtBQUssQ0FBQyxhQUFhLENBQ3pDLFdBQVcsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBRXhGLFdBQVcsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUE7Z0JBRW5DLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7Z0JBQ3pFLE1BQUs7YUFDTjtZQUVELE9BQU8sR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQTtTQUN4QztLQUNGO0FBQ0gsQ0FBQztBQUVELFNBQVMsT0FBTyxDQUNkLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQXNCLEVBQ3BELEtBQXFCO0lBRXJCLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUE7SUFFakMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUU7UUFDNUIsQ0FBQyxXQUFXLENBQUMsVUFBVSxJQUFJLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDO1FBQzNELFFBQVEsRUFBRTtRQUNSLE9BQU8sSUFBSSxDQUFBO0tBQ1o7SUFFRCxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUE7SUFFdkMsTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFBO0lBQzlCLE1BQU0sRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUE7SUFDOUQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUVwRSxJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUE7SUFDckIsSUFBSSxjQUFtRCxDQUFBO0lBRXZELHFDQUFxQztJQUNyQyxNQUFNLGVBQWUsR0FBRyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsT0FBTztRQUNoQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxTQUFTO1FBQ3ZDLEtBQUssS0FBSyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUE7SUFFOUMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxlQUFlO1FBQzlCLENBQUMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7UUFDN0MsWUFBWSxHQUFHLE9BQU8sQ0FBQyxRQUFRO1FBQy9CLFlBQVksR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUE7SUFFbEMsTUFBTSxXQUFXLEdBQUc7UUFDbEIsV0FBVztRQUNYLFVBQVUsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFDekQsTUFBTSxFQUFFLGVBQWUsSUFBSSxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQ3pELENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxjQUFjLENBQUMsQ0FDckQ7UUFDRCxNQUFNLEVBQUUsSUFBSTtRQUNaLFVBQVUsRUFBRSxTQUFTO1FBQ3JCLGNBQWMsRUFBRSxJQUFJO0tBQ3JCLENBQUE7SUFFRCxZQUFZO0lBQ1osSUFBSSxlQUFlLElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDL0IsV0FBVyxDQUFDLFVBQVUsR0FBRyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQTtRQUNuRCxXQUFXLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQTtRQUNsQyxjQUFjLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQTtRQUU5QyxJQUFJLGNBQWMsQ0FBQyxPQUFPLEVBQUU7WUFDMUIsU0FBUyxHQUFHLElBQUksQ0FBQTtTQUNqQjtLQUNGO0lBRUQsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLFNBQVMsQ0FBQyxFQUFFO1FBQUUsT0FBTyxJQUFJLENBQUE7S0FBRTtJQUU1QyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7SUFFaEUsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLFVBQVUsR0FBRyxJQUFJLEtBQUssQ0FBQyxhQUFhLENBQzFFLFdBQVcsRUFDWCxLQUFLO0lBQ0wsc0NBQXNDO0lBQ3RDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBUyxFQUM5QixVQUFVLENBQUMsWUFBWSxFQUN2QixXQUFXLENBQUMsT0FBTyxDQUNwQixDQUFBO0lBRUQsS0FBSyxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUE7SUFFZCxLQUFLLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQTtJQUNuQixLQUFLLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUE7SUFDdkMsV0FBVyxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUE7SUFFOUIsV0FBVyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFBO0lBRS9DLElBQUksT0FBTyxFQUFFO1FBQ1gsS0FBSyxDQUFDLEdBQUcsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBO1FBQ2hELEtBQUssQ0FBQyxHQUFHLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQTtRQUNoRCxLQUFLLENBQUMsRUFBRSxHQUFHLFlBQVksQ0FBQTtRQUV2QixXQUFXLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFBO1FBRS9CLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUVqRSxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFBO1FBQ3BDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUE7UUFDcEMsV0FBVyxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUE7UUFDbEMsV0FBVyxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUE7UUFFakMsY0FBYyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUE7UUFFOUMsS0FBSyxDQUFDLFVBQVUsSUFBSSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQTtRQUMxQyxLQUFLLENBQUMsVUFBVSxJQUFJLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBO1FBRTFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQTtLQUM1RDtTQUNJO1FBQ0gsS0FBSyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUE7UUFDdEIsS0FBSyxDQUFDLEVBQUUsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQTtRQUNqQyxLQUFLLENBQUMsRUFBRSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBO1FBRWpDLEtBQUssQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFFdkIsS0FBSyxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFBO0tBQzdEO0lBRUQsT0FBTyxLQUFLLENBQUE7QUFDZCxDQUFDO0FBRUQsU0FBUyxJQUFJLENBQUUsRUFBRSxXQUFXLEVBQXNCO0lBQ2hELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUE7SUFDakMsSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ3pCLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFBO1FBQ3BCLFdBQVcsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFBO0tBQzlCO0FBQ0gsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFFLFdBQWlDLEVBQUUsS0FBSztJQUM1RCxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUE7SUFDdkMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQTtJQUNqQyxNQUFNLFVBQVUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFBO0lBRWxFLEtBQUssQ0FBQyxFQUFFLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO0lBQ3ZDLEtBQUssQ0FBQyxFQUFFLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO0lBQ3ZDLEtBQUssQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFBO0lBQzVDLEtBQUssQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFFdkIsS0FBSyxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxVQUFVLENBQUMsR0FBRyxNQUFNLENBQUE7SUFDL0QsS0FBSyxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxVQUFVLENBQUMsR0FBRyxNQUFNLENBQUE7SUFDL0QsS0FBSyxDQUFDLEVBQUUsR0FBRyxVQUFVLENBQUE7SUFFckIsS0FBSyxDQUFDLFNBQVMsR0FBRyxNQUFNLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQTtJQUNuQyxLQUFLLENBQUMsU0FBUyxHQUFHLENBQUMsR0FBRyxPQUFPLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxFQUFFLENBQUE7QUFDbkQsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFFLFdBQWlDO0lBQ3JELG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBQ2hDLEtBQUssQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDdkcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0lBRXJGLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUE7SUFDakMsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBQ3ZDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUE7SUFDakMsTUFBTSxDQUFDLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFBO0lBRTlDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxFQUFFLEVBQUU7UUFDaEIsTUFBTSxRQUFRLEdBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQTtRQUVqRixJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssS0FBSyxDQUFDLEVBQUUsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLEtBQUssQ0FBQyxFQUFFLEVBQUU7WUFDbEUsS0FBSyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsRUFBRSxHQUFHLFFBQVEsQ0FBQTtZQUM5QixLQUFLLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxFQUFFLEdBQUcsUUFBUSxDQUFBO1NBQy9CO2FBQ0k7WUFDSCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsc0JBQXNCLENBQzVDLENBQUMsRUFBRSxDQUFDLEVBQ0osS0FBSyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUNsQixLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVLEVBQ2xDLFFBQVEsQ0FBQyxDQUFBO1lBRVgsS0FBSyxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFBO1lBQ3RCLEtBQUssQ0FBQyxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQTtTQUN2QjtRQUVELFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQTtRQUVsQixLQUFLLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUE7S0FDNUQ7U0FDSTtRQUNILEtBQUssQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQTtRQUMzQixLQUFLLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUE7UUFFM0IsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFBO1FBQ2xCLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFBO1FBQ2pDLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFBO1FBQ3BCLFdBQVcsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFBO0tBQzlCO0lBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUMzRSxDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUUsV0FBaUM7SUFDdEQsbUJBQW1CLENBQUMsV0FBVyxDQUFDLENBQUE7SUFFaEMsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQTtJQUNqQyxNQUFNLENBQUMsR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQTtJQUN2QyxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxFQUFFLEdBQUcsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBRS9ELElBQUksQ0FBQyxHQUFHLFFBQVEsRUFBRTtRQUNoQixLQUFLLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFBO1FBQ3RELEtBQUssQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUE7UUFFdEQsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFBO1FBRWxCLEtBQUssQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQTtLQUM3RDtTQUNJO1FBQ0gsS0FBSyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFBO1FBQ25CLEtBQUssQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQTtRQUVuQixXQUFXLENBQUMsSUFBSSxFQUFFLENBQUE7UUFDbEIsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUE7UUFFakMsS0FBSyxDQUFDLFNBQVM7WUFDYixLQUFLLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQTtRQUN0QixXQUFXLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQTtLQUM5QjtBQUNILENBQUM7QUFFRCxTQUFTLG1CQUFtQixDQUFFLFdBQWlDO0lBQzdELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUE7SUFFakMsa0NBQWtDO0lBQ2xDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQUUsT0FBTTtLQUFFO0lBRTdCLE1BQU0sTUFBTSxHQUFLLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFBO0lBQ3BDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFBO0lBRXRDLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUU7WUFDaEQsS0FBSyxFQUFJLE1BQU0sQ0FBQyxDQUFDLEdBQUssS0FBSyxDQUFDLEVBQUU7WUFDOUIsS0FBSyxFQUFJLE1BQU0sQ0FBQyxDQUFDLEdBQUssS0FBSyxDQUFDLEVBQUU7WUFDOUIsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLEVBQUU7WUFDOUIsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLEVBQUU7U0FDL0IsQ0FBRSxFQUFFLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO0FBQzFCLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBRSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQXdCO0lBQ25FLE9BQU8sWUFBWTtRQUNqQixZQUFZLENBQUMsT0FBTztRQUNwQixRQUFRLENBQUMsSUFBSTtRQUNiLFlBQVksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQTtBQUMvQyxDQUFDO0FBRUQsZUFBZTtJQUNiLEVBQUUsRUFBRSxTQUFTO0lBQ2IsT0FBTztJQUNQLFdBQVc7SUFDWCxXQUFXO0lBQ1gsWUFBWTtJQUNaLG1CQUFtQjtDQUNwQixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRXZlbnRQaGFzZSB9IGZyb20gJ0BpbnRlcmFjdGpzL2NvcmUvSW50ZXJhY3RFdmVudCdcbmltcG9ydCBtb2RpZmllcnMgZnJvbSAnQGludGVyYWN0anMvbW9kaWZpZXJzL2Jhc2UnXG5pbXBvcnQgKiBhcyB1dGlscyBmcm9tICdAaW50ZXJhY3Rqcy91dGlscydcbmltcG9ydCByYWYgZnJvbSAnQGludGVyYWN0anMvdXRpbHMvcmFmJ1xuXG5kZWNsYXJlIG1vZHVsZSAnQGludGVyYWN0anMvY29yZS9JbnRlcmFjdEV2ZW50JyB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1zaGFkb3dcbiAgZW51bSBFdmVudFBoYXNlIHtcbiAgICBSZXN1bWUgPSAncmVzdW1lJyxcbiAgICBJbmVydGlhU3RhcnQgPSAnaW5lcnRpYXN0YXJ0JyxcbiAgfVxufVxuXG5kZWNsYXJlIG1vZHVsZSAnQGludGVyYWN0anMvY29yZS9JbnRlcmFjdGlvbicge1xuICBpbnRlcmZhY2UgSW50ZXJhY3Rpb24ge1xuICAgIGluZXJ0aWE/OiB7XG4gICAgICBhY3RpdmU6IGJvb2xlYW5cbiAgICAgIHNtb290aEVuZDogYm9vbGVhblxuICAgICAgYWxsb3dSZXN1bWU6IGJvb2xlYW5cblxuICAgICAgc3RhcnRFdmVudD86IEludGVyYWN0LkludGVyYWN0RXZlbnRcbiAgICAgIHVwQ29vcmRzOiB7XG4gICAgICAgIHBhZ2U6IEludGVyYWN0LlBvaW50XG4gICAgICAgIGNsaWVudDogSW50ZXJhY3QuUG9pbnRcbiAgICAgICAgdGltZVN0YW1wOiBudW1iZXJcbiAgICAgIH1cblxuICAgICAgeGU/OiBudW1iZXJcbiAgICAgIHllPzogbnVtYmVyXG4gICAgICBzeD86IG51bWJlclxuICAgICAgc3k/OiBudW1iZXJcblxuICAgICAgdDA/OiBudW1iZXJcbiAgICAgIHRlPzogbnVtYmVyXG4gICAgICB2MD86IG51bWJlclxuICAgICAgdngwPzogbnVtYmVyXG4gICAgICB2eTA/OiBudW1iZXJcbiAgICAgIGR1cmF0aW9uPzogbnVtYmVyXG4gICAgICBtb2RpZmllZFhlPzogbnVtYmVyXG4gICAgICBtb2RpZmllZFllPzogbnVtYmVyXG5cbiAgICAgIGxhbWJkYV92MD86IG51bWJlciAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGNhbWVsY2FzZVxuICAgICAgb25lX3ZlX3YwPzogbnVtYmVyIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgY2FtZWxjYXNlXG4gICAgICB0aW1lb3V0OiBhbnlcbiAgICB9XG4gIH1cbn1cblxuZGVjbGFyZSBtb2R1bGUgJ0BpbnRlcmFjdGpzL2NvcmUvZGVmYXVsdE9wdGlvbnMnIHtcbiAgaW50ZXJmYWNlIFBlckFjdGlvbkRlZmF1bHRzIHtcbiAgICBpbmVydGlhPzoge1xuICAgICAgZW5hYmxlZD86IGJvb2xlYW4sXG4gICAgICByZXNpc3RhbmNlPzogbnVtYmVyLCAgICAgICAgLy8gdGhlIGxhbWJkYSBpbiBleHBvbmVudGlhbCBkZWNheVxuICAgICAgbWluU3BlZWQ/OiBudW1iZXIsICAgICAgICAgIC8vIHRhcmdldCBzcGVlZCBtdXN0IGJlIGFib3ZlIHRoaXMgZm9yIGluZXJ0aWEgdG8gc3RhcnRcbiAgICAgIGVuZFNwZWVkPzogbnVtYmVyLCAgICAgICAgICAvLyB0aGUgc3BlZWQgYXQgd2hpY2ggaW5lcnRpYSBpcyBzbG93IGVub3VnaCB0byBzdG9wXG4gICAgICBhbGxvd1Jlc3VtZT86IHRydWUsICAgICAgICAgLy8gYWxsb3cgcmVzdW1pbmcgYW4gYWN0aW9uIGluIGluZXJ0aWEgcGhhc2VcbiAgICAgIHNtb290aEVuZER1cmF0aW9uPzogbnVtYmVyLCAvLyBhbmltYXRlIHRvIHNuYXAvcmVzdHJpY3QgZW5kT25seSBpZiB0aGVyZSdzIG5vIGluZXJ0aWFcbiAgICB9IHwgYm9vbGVhbiAvLyBGSVhNRVxuICB9XG59XG5cbihFdmVudFBoYXNlIGFzIGFueSkuUmVzdW1lID0gJ3Jlc3VtZSc7XG4oRXZlbnRQaGFzZSBhcyBhbnkpLkluZXJ0aWFTdGFydCA9ICdpbmVydGlhc3RhcnQnXG5cbmZ1bmN0aW9uIGluc3RhbGwgKHNjb3BlOiBJbnRlcmFjdC5TY29wZSkge1xuICBjb25zdCB7XG4gICAgaW50ZXJhY3Rpb25zLFxuICAgIGRlZmF1bHRzLFxuICB9ID0gc2NvcGVcblxuICBpbnRlcmFjdGlvbnMuc2lnbmFscy5vbignbmV3JywgKHsgaW50ZXJhY3Rpb24gfSkgPT4ge1xuICAgIGludGVyYWN0aW9uLmluZXJ0aWEgPSB7XG4gICAgICBhY3RpdmUgICAgIDogZmFsc2UsXG4gICAgICBzbW9vdGhFbmQgIDogZmFsc2UsXG4gICAgICBhbGxvd1Jlc3VtZTogZmFsc2UsXG4gICAgICB1cENvb3JkcyAgIDoge30gYXMgYW55LFxuICAgICAgdGltZW91dCAgICA6IG51bGwsXG4gICAgfVxuICB9KVxuXG4gIC8vIEZJWE1FIHByb3BlciBzaWduYWwgdHlwaW5nXG4gIGludGVyYWN0aW9ucy5zaWduYWxzLm9uKCdiZWZvcmUtYWN0aW9uLWVuZCcsIChhcmcpID0+IHJlbGVhc2UoYXJnIGFzIGFueSwgc2NvcGUpKVxuICBpbnRlcmFjdGlvbnMuc2lnbmFscy5vbignZG93bicsIChhcmcpID0+IHJlc3VtZShhcmcgYXMgYW55LCBzY29wZSkpXG4gIGludGVyYWN0aW9ucy5zaWduYWxzLm9uKCdzdG9wJywgKGFyZykgPT4gc3RvcChhcmcgYXMgYW55KSlcblxuICBkZWZhdWx0cy5wZXJBY3Rpb24uaW5lcnRpYSA9IHtcbiAgICBlbmFibGVkICAgICAgICAgIDogZmFsc2UsXG4gICAgcmVzaXN0YW5jZSAgICAgICA6IDEwLCAgICAvLyB0aGUgbGFtYmRhIGluIGV4cG9uZW50aWFsIGRlY2F5XG4gICAgbWluU3BlZWQgICAgICAgICA6IDEwMCwgICAvLyB0YXJnZXQgc3BlZWQgbXVzdCBiZSBhYm92ZSB0aGlzIGZvciBpbmVydGlhIHRvIHN0YXJ0XG4gICAgZW5kU3BlZWQgICAgICAgICA6IDEwLCAgICAvLyB0aGUgc3BlZWQgYXQgd2hpY2ggaW5lcnRpYSBpcyBzbG93IGVub3VnaCB0byBzdG9wXG4gICAgYWxsb3dSZXN1bWUgICAgICA6IHRydWUsICAvLyBhbGxvdyByZXN1bWluZyBhbiBhY3Rpb24gaW4gaW5lcnRpYSBwaGFzZVxuICAgIHNtb290aEVuZER1cmF0aW9uOiAzMDAsICAgLy8gYW5pbWF0ZSB0byBzbmFwL3Jlc3RyaWN0IGVuZE9ubHkgaWYgdGhlcmUncyBubyBpbmVydGlhXG4gIH1cblxuICBzY29wZS51c2VQbHVnaW4obW9kaWZpZXJzKVxufVxuXG5mdW5jdGlvbiByZXN1bWUgKFxuICB7IGludGVyYWN0aW9uLCBldmVudCwgcG9pbnRlciwgZXZlbnRUYXJnZXQgfTogSW50ZXJhY3QuU2lnbmFsQXJnLFxuICBzY29wZTogSW50ZXJhY3QuU2NvcGVcbikge1xuICBjb25zdCBzdGF0ZSA9IGludGVyYWN0aW9uLmluZXJ0aWFcblxuICAvLyBDaGVjayBpZiB0aGUgZG93biBldmVudCBoaXRzIHRoZSBjdXJyZW50IGluZXJ0aWEgdGFyZ2V0XG4gIGlmIChzdGF0ZS5hY3RpdmUpIHtcbiAgICBsZXQgZWxlbWVudCA9IGV2ZW50VGFyZ2V0XG5cbiAgICAvLyBjbGltYiB1cCB0aGUgRE9NIHRyZWUgZnJvbSB0aGUgZXZlbnQgdGFyZ2V0XG4gICAgd2hpbGUgKHV0aWxzLmlzLmVsZW1lbnQoZWxlbWVudCkpIHtcbiAgICAgIC8vIGlmIGludGVyYWN0aW9uIGVsZW1lbnQgaXMgdGhlIGN1cnJlbnQgaW5lcnRpYSB0YXJnZXQgZWxlbWVudFxuICAgICAgaWYgKGVsZW1lbnQgPT09IGludGVyYWN0aW9uLmVsZW1lbnQpIHtcbiAgICAgICAgLy8gc3RvcCBpbmVydGlhXG4gICAgICAgIHJhZi5jYW5jZWwoc3RhdGUudGltZW91dClcbiAgICAgICAgc3RhdGUuYWN0aXZlID0gZmFsc2VcbiAgICAgICAgaW50ZXJhY3Rpb24uc2ltdWxhdGlvbiA9IG51bGxcblxuICAgICAgICAvLyB1cGRhdGUgcG9pbnRlcnMgdG8gdGhlIGRvd24gZXZlbnQncyBjb29yZGluYXRlc1xuICAgICAgICBpbnRlcmFjdGlvbi51cGRhdGVQb2ludGVyKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgdHJ1ZSlcbiAgICAgICAgdXRpbHMucG9pbnRlci5zZXRDb29yZHMoXG4gICAgICAgICAgaW50ZXJhY3Rpb24uY29vcmRzLmN1cixcbiAgICAgICAgICBpbnRlcmFjdGlvbi5wb2ludGVycy5tYXAoKHApID0+IHAucG9pbnRlciksXG4gICAgICAgICAgaW50ZXJhY3Rpb24uX25vdygpXG4gICAgICAgIClcblxuICAgICAgICAvLyBmaXJlIGFwcHJvcHJpYXRlIHNpZ25hbHNcbiAgICAgICAgY29uc3Qgc2lnbmFsQXJnID0ge1xuICAgICAgICAgIGludGVyYWN0aW9uLFxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUuaW50ZXJhY3Rpb25zLnNpZ25hbHMuZmlyZSgnYWN0aW9uLXJlc3VtZScsIHNpZ25hbEFyZylcblxuICAgICAgICAvLyBmaXJlIGEgcmV1bWUgZXZlbnRcbiAgICAgICAgY29uc3QgcmVzdW1lRXZlbnQgPSBuZXcgc2NvcGUuSW50ZXJhY3RFdmVudChcbiAgICAgICAgICBpbnRlcmFjdGlvbiwgZXZlbnQsIGludGVyYWN0aW9uLnByZXBhcmVkLm5hbWUsIEV2ZW50UGhhc2UuUmVzdW1lLCBpbnRlcmFjdGlvbi5lbGVtZW50KVxuXG4gICAgICAgIGludGVyYWN0aW9uLl9maXJlRXZlbnQocmVzdW1lRXZlbnQpXG5cbiAgICAgICAgdXRpbHMucG9pbnRlci5jb3B5Q29vcmRzKGludGVyYWN0aW9uLmNvb3Jkcy5wcmV2LCBpbnRlcmFjdGlvbi5jb29yZHMuY3VyKVxuICAgICAgICBicmVha1xuICAgICAgfVxuXG4gICAgICBlbGVtZW50ID0gdXRpbHMuZG9tLnBhcmVudE5vZGUoZWxlbWVudClcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVsZWFzZTxUIGV4dGVuZHMgSW50ZXJhY3QuQWN0aW9uTmFtZT4gKFxuICB7IGludGVyYWN0aW9uLCBldmVudCwgbm9QcmVFbmQgfTogSW50ZXJhY3QuU2lnbmFsQXJnLFxuICBzY29wZTogSW50ZXJhY3QuU2NvcGVcbikge1xuICBjb25zdCBzdGF0ZSA9IGludGVyYWN0aW9uLmluZXJ0aWFcblxuICBpZiAoIWludGVyYWN0aW9uLmludGVyYWN0aW5nKCkgfHxcbiAgICAoaW50ZXJhY3Rpb24uc2ltdWxhdGlvbiAmJiBpbnRlcmFjdGlvbi5zaW11bGF0aW9uLmFjdGl2ZSkgfHxcbiAgbm9QcmVFbmQpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgY29uc3Qgb3B0aW9ucyA9IGdldE9wdGlvbnMoaW50ZXJhY3Rpb24pXG5cbiAgY29uc3Qgbm93ID0gaW50ZXJhY3Rpb24uX25vdygpXG4gIGNvbnN0IHsgY2xpZW50OiB2ZWxvY2l0eUNsaWVudCB9ID0gaW50ZXJhY3Rpb24uY29vcmRzLnZlbG9jaXR5XG4gIGNvbnN0IHBvaW50ZXJTcGVlZCA9IHV0aWxzLmh5cG90KHZlbG9jaXR5Q2xpZW50LngsIHZlbG9jaXR5Q2xpZW50LnkpXG5cbiAgbGV0IHNtb290aEVuZCA9IGZhbHNlXG4gIGxldCBtb2RpZmllclJlc3VsdDogUmV0dXJuVHlwZTx0eXBlb2YgbW9kaWZpZXJzLnNldEFsbD5cblxuICAvLyBjaGVjayBpZiBpbmVydGlhIHNob3VsZCBiZSBzdGFydGVkXG4gIGNvbnN0IGluZXJ0aWFQb3NzaWJsZSA9IChvcHRpb25zICYmIG9wdGlvbnMuZW5hYmxlZCAmJlxuICAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24ucHJlcGFyZWQubmFtZSAhPT0gJ2dlc3R1cmUnICYmXG4gICAgICAgICAgICAgICAgICAgICBldmVudCAhPT0gc3RhdGUuc3RhcnRFdmVudClcblxuICBjb25zdCBpbmVydGlhID0gKGluZXJ0aWFQb3NzaWJsZSAmJlxuICAgIChub3cgLSBpbnRlcmFjdGlvbi5jb29yZHMuY3VyLnRpbWVTdGFtcCkgPCA1MCAmJlxuICAgIHBvaW50ZXJTcGVlZCA+IG9wdGlvbnMubWluU3BlZWQgJiZcbiAgICBwb2ludGVyU3BlZWQgPiBvcHRpb25zLmVuZFNwZWVkKVxuXG4gIGNvbnN0IG1vZGlmaWVyQXJnID0ge1xuICAgIGludGVyYWN0aW9uLFxuICAgIHBhZ2VDb29yZHM6IHV0aWxzLmV4dGVuZCh7fSwgaW50ZXJhY3Rpb24uY29vcmRzLmN1ci5wYWdlKSxcbiAgICBzdGF0ZXM6IGluZXJ0aWFQb3NzaWJsZSAmJiBpbnRlcmFjdGlvbi5tb2RpZmllcnMuc3RhdGVzLm1hcChcbiAgICAgIChtb2RpZmllclN0YXR1cykgPT4gdXRpbHMuZXh0ZW5kKHt9LCBtb2RpZmllclN0YXR1cylcbiAgICApLFxuICAgIHByZUVuZDogdHJ1ZSxcbiAgICBwcmV2Q29vcmRzOiB1bmRlZmluZWQsXG4gICAgcmVxdWlyZUVuZE9ubHk6IG51bGwsXG4gIH1cblxuICAvLyBzbW9vdGhFbmRcbiAgaWYgKGluZXJ0aWFQb3NzaWJsZSAmJiAhaW5lcnRpYSkge1xuICAgIG1vZGlmaWVyQXJnLnByZXZDb29yZHMgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQucGFnZVxuICAgIG1vZGlmaWVyQXJnLnJlcXVpcmVFbmRPbmx5ID0gZmFsc2VcbiAgICBtb2RpZmllclJlc3VsdCA9IG1vZGlmaWVycy5zZXRBbGwobW9kaWZpZXJBcmcpXG5cbiAgICBpZiAobW9kaWZpZXJSZXN1bHQuY2hhbmdlZCkge1xuICAgICAgc21vb3RoRW5kID0gdHJ1ZVxuICAgIH1cbiAgfVxuXG4gIGlmICghKGluZXJ0aWEgfHwgc21vb3RoRW5kKSkgeyByZXR1cm4gbnVsbCB9XG5cbiAgdXRpbHMucG9pbnRlci5jb3B5Q29vcmRzKHN0YXRlLnVwQ29vcmRzLCBpbnRlcmFjdGlvbi5jb29yZHMuY3VyKVxuXG4gIGludGVyYWN0aW9uLnBvaW50ZXJzWzBdLnBvaW50ZXIgPSBzdGF0ZS5zdGFydEV2ZW50ID0gbmV3IHNjb3BlLkludGVyYWN0RXZlbnQoXG4gICAgaW50ZXJhY3Rpb24sXG4gICAgZXZlbnQsXG4gICAgLy8gRklYTUUgYWRkIHByb3BlciB0eXBpbmcgQWN0aW9uLm5hbWVcbiAgICBpbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lIGFzIFQsXG4gICAgRXZlbnRQaGFzZS5JbmVydGlhU3RhcnQsXG4gICAgaW50ZXJhY3Rpb24uZWxlbWVudCxcbiAgKVxuXG4gIHN0YXRlLnQwID0gbm93XG5cbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZVxuICBzdGF0ZS5hbGxvd1Jlc3VtZSA9IG9wdGlvbnMuYWxsb3dSZXN1bWVcbiAgaW50ZXJhY3Rpb24uc2ltdWxhdGlvbiA9IHN0YXRlXG5cbiAgaW50ZXJhY3Rpb24uaW50ZXJhY3RhYmxlLmZpcmUoc3RhdGUuc3RhcnRFdmVudClcblxuICBpZiAoaW5lcnRpYSkge1xuICAgIHN0YXRlLnZ4MCA9IGludGVyYWN0aW9uLmNvb3Jkcy52ZWxvY2l0eS5jbGllbnQueFxuICAgIHN0YXRlLnZ5MCA9IGludGVyYWN0aW9uLmNvb3Jkcy52ZWxvY2l0eS5jbGllbnQueVxuICAgIHN0YXRlLnYwID0gcG9pbnRlclNwZWVkXG5cbiAgICBjYWxjSW5lcnRpYShpbnRlcmFjdGlvbiwgc3RhdGUpXG5cbiAgICB1dGlscy5leHRlbmQobW9kaWZpZXJBcmcucGFnZUNvb3JkcywgaW50ZXJhY3Rpb24uY29vcmRzLmN1ci5wYWdlKVxuXG4gICAgbW9kaWZpZXJBcmcucGFnZUNvb3Jkcy54ICs9IHN0YXRlLnhlXG4gICAgbW9kaWZpZXJBcmcucGFnZUNvb3Jkcy55ICs9IHN0YXRlLnllXG4gICAgbW9kaWZpZXJBcmcucHJldkNvb3JkcyA9IHVuZGVmaW5lZFxuICAgIG1vZGlmaWVyQXJnLnJlcXVpcmVFbmRPbmx5ID0gdHJ1ZVxuXG4gICAgbW9kaWZpZXJSZXN1bHQgPSBtb2RpZmllcnMuc2V0QWxsKG1vZGlmaWVyQXJnKVxuXG4gICAgc3RhdGUubW9kaWZpZWRYZSArPSBtb2RpZmllclJlc3VsdC5kZWx0YS54XG4gICAgc3RhdGUubW9kaWZpZWRZZSArPSBtb2RpZmllclJlc3VsdC5kZWx0YS55XG5cbiAgICBzdGF0ZS50aW1lb3V0ID0gcmFmLnJlcXVlc3QoKCkgPT4gaW5lcnRpYVRpY2soaW50ZXJhY3Rpb24pKVxuICB9XG4gIGVsc2Uge1xuICAgIHN0YXRlLnNtb290aEVuZCA9IHRydWVcbiAgICBzdGF0ZS54ZSA9IG1vZGlmaWVyUmVzdWx0LmRlbHRhLnhcbiAgICBzdGF0ZS55ZSA9IG1vZGlmaWVyUmVzdWx0LmRlbHRhLnlcblxuICAgIHN0YXRlLnN4ID0gc3RhdGUuc3kgPSAwXG5cbiAgICBzdGF0ZS50aW1lb3V0ID0gcmFmLnJlcXVlc3QoKCkgPT4gc21vdGhFbmRUaWNrKGludGVyYWN0aW9uKSlcbiAgfVxuXG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBzdG9wICh7IGludGVyYWN0aW9uIH06IEludGVyYWN0LlNpZ25hbEFyZykge1xuICBjb25zdCBzdGF0ZSA9IGludGVyYWN0aW9uLmluZXJ0aWFcbiAgaWYgKHN0YXRlLmFjdGl2ZSkge1xuICAgIHJhZi5jYW5jZWwoc3RhdGUudGltZW91dClcbiAgICBzdGF0ZS5hY3RpdmUgPSBmYWxzZVxuICAgIGludGVyYWN0aW9uLnNpbXVsYXRpb24gPSBudWxsXG4gIH1cbn1cblxuZnVuY3Rpb24gY2FsY0luZXJ0aWEgKGludGVyYWN0aW9uOiBJbnRlcmFjdC5JbnRlcmFjdGlvbiwgc3RhdGUpIHtcbiAgY29uc3Qgb3B0aW9ucyA9IGdldE9wdGlvbnMoaW50ZXJhY3Rpb24pXG4gIGNvbnN0IGxhbWJkYSA9IG9wdGlvbnMucmVzaXN0YW5jZVxuICBjb25zdCBpbmVydGlhRHVyID0gLU1hdGgubG9nKG9wdGlvbnMuZW5kU3BlZWQgLyBzdGF0ZS52MCkgLyBsYW1iZGFcblxuICBzdGF0ZS54MCA9IGludGVyYWN0aW9uLnByZXZFdmVudC5wYWdlLnhcbiAgc3RhdGUueTAgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQucGFnZS55XG4gIHN0YXRlLnQwID0gc3RhdGUuc3RhcnRFdmVudC50aW1lU3RhbXAgLyAxMDAwXG4gIHN0YXRlLnN4ID0gc3RhdGUuc3kgPSAwXG5cbiAgc3RhdGUubW9kaWZpZWRYZSA9IHN0YXRlLnhlID0gKHN0YXRlLnZ4MCAtIGluZXJ0aWFEdXIpIC8gbGFtYmRhXG4gIHN0YXRlLm1vZGlmaWVkWWUgPSBzdGF0ZS55ZSA9IChzdGF0ZS52eTAgLSBpbmVydGlhRHVyKSAvIGxhbWJkYVxuICBzdGF0ZS50ZSA9IGluZXJ0aWFEdXJcblxuICBzdGF0ZS5sYW1iZGFfdjAgPSBsYW1iZGEgLyBzdGF0ZS52MFxuICBzdGF0ZS5vbmVfdmVfdjAgPSAxIC0gb3B0aW9ucy5lbmRTcGVlZCAvIHN0YXRlLnYwXG59XG5cbmZ1bmN0aW9uIGluZXJ0aWFUaWNrIChpbnRlcmFjdGlvbjogSW50ZXJhY3QuSW50ZXJhY3Rpb24pIHtcbiAgdXBkYXRlSW5lcnRpYUNvb3JkcyhpbnRlcmFjdGlvbilcbiAgdXRpbHMucG9pbnRlci5zZXRDb29yZERlbHRhcyhpbnRlcmFjdGlvbi5jb29yZHMuZGVsdGEsIGludGVyYWN0aW9uLmNvb3Jkcy5wcmV2LCBpbnRlcmFjdGlvbi5jb29yZHMuY3VyKVxuICB1dGlscy5wb2ludGVyLnNldENvb3JkVmVsb2NpdHkoaW50ZXJhY3Rpb24uY29vcmRzLnZlbG9jaXR5LCBpbnRlcmFjdGlvbi5jb29yZHMuZGVsdGEpXG5cbiAgY29uc3Qgc3RhdGUgPSBpbnRlcmFjdGlvbi5pbmVydGlhXG4gIGNvbnN0IG9wdGlvbnMgPSBnZXRPcHRpb25zKGludGVyYWN0aW9uKVxuICBjb25zdCBsYW1iZGEgPSBvcHRpb25zLnJlc2lzdGFuY2VcbiAgY29uc3QgdCA9IGludGVyYWN0aW9uLl9ub3coKSAvIDEwMDAgLSBzdGF0ZS50MFxuXG4gIGlmICh0IDwgc3RhdGUudGUpIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9ICAxIC0gKE1hdGguZXhwKC1sYW1iZGEgKiB0KSAtIHN0YXRlLmxhbWJkYV92MCkgLyBzdGF0ZS5vbmVfdmVfdjBcblxuICAgIGlmIChzdGF0ZS5tb2RpZmllZFhlID09PSBzdGF0ZS54ZSAmJiBzdGF0ZS5tb2RpZmllZFllID09PSBzdGF0ZS55ZSkge1xuICAgICAgc3RhdGUuc3ggPSBzdGF0ZS54ZSAqIHByb2dyZXNzXG4gICAgICBzdGF0ZS5zeSA9IHN0YXRlLnllICogcHJvZ3Jlc3NcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBjb25zdCBxdWFkUG9pbnQgPSB1dGlscy5nZXRRdWFkcmF0aWNDdXJ2ZVBvaW50KFxuICAgICAgICAwLCAwLFxuICAgICAgICBzdGF0ZS54ZSwgc3RhdGUueWUsXG4gICAgICAgIHN0YXRlLm1vZGlmaWVkWGUsIHN0YXRlLm1vZGlmaWVkWWUsXG4gICAgICAgIHByb2dyZXNzKVxuXG4gICAgICBzdGF0ZS5zeCA9IHF1YWRQb2ludC54XG4gICAgICBzdGF0ZS5zeSA9IHF1YWRQb2ludC55XG4gICAgfVxuXG4gICAgaW50ZXJhY3Rpb24ubW92ZSgpXG5cbiAgICBzdGF0ZS50aW1lb3V0ID0gcmFmLnJlcXVlc3QoKCkgPT4gaW5lcnRpYVRpY2soaW50ZXJhY3Rpb24pKVxuICB9XG4gIGVsc2Uge1xuICAgIHN0YXRlLnN4ID0gc3RhdGUubW9kaWZpZWRYZVxuICAgIHN0YXRlLnN5ID0gc3RhdGUubW9kaWZpZWRZZVxuXG4gICAgaW50ZXJhY3Rpb24ubW92ZSgpXG4gICAgaW50ZXJhY3Rpb24uZW5kKHN0YXRlLnN0YXJ0RXZlbnQpXG4gICAgc3RhdGUuYWN0aXZlID0gZmFsc2VcbiAgICBpbnRlcmFjdGlvbi5zaW11bGF0aW9uID0gbnVsbFxuICB9XG5cbiAgdXRpbHMucG9pbnRlci5jb3B5Q29vcmRzKGludGVyYWN0aW9uLmNvb3Jkcy5wcmV2LCBpbnRlcmFjdGlvbi5jb29yZHMuY3VyKVxufVxuXG5mdW5jdGlvbiBzbW90aEVuZFRpY2sgKGludGVyYWN0aW9uOiBJbnRlcmFjdC5JbnRlcmFjdGlvbikge1xuICB1cGRhdGVJbmVydGlhQ29vcmRzKGludGVyYWN0aW9uKVxuXG4gIGNvbnN0IHN0YXRlID0gaW50ZXJhY3Rpb24uaW5lcnRpYVxuICBjb25zdCB0ID0gaW50ZXJhY3Rpb24uX25vdygpIC0gc3RhdGUudDBcbiAgY29uc3QgeyBzbW9vdGhFbmREdXJhdGlvbjogZHVyYXRpb24gfSA9IGdldE9wdGlvbnMoaW50ZXJhY3Rpb24pXG5cbiAgaWYgKHQgPCBkdXJhdGlvbikge1xuICAgIHN0YXRlLnN4ID0gdXRpbHMuZWFzZU91dFF1YWQodCwgMCwgc3RhdGUueGUsIGR1cmF0aW9uKVxuICAgIHN0YXRlLnN5ID0gdXRpbHMuZWFzZU91dFF1YWQodCwgMCwgc3RhdGUueWUsIGR1cmF0aW9uKVxuXG4gICAgaW50ZXJhY3Rpb24ubW92ZSgpXG5cbiAgICBzdGF0ZS50aW1lb3V0ID0gcmFmLnJlcXVlc3QoKCkgPT4gc21vdGhFbmRUaWNrKGludGVyYWN0aW9uKSlcbiAgfVxuICBlbHNlIHtcbiAgICBzdGF0ZS5zeCA9IHN0YXRlLnhlXG4gICAgc3RhdGUuc3kgPSBzdGF0ZS55ZVxuXG4gICAgaW50ZXJhY3Rpb24ubW92ZSgpXG4gICAgaW50ZXJhY3Rpb24uZW5kKHN0YXRlLnN0YXJ0RXZlbnQpXG5cbiAgICBzdGF0ZS5zbW9vdGhFbmQgPVxuICAgICAgc3RhdGUuYWN0aXZlID0gZmFsc2VcbiAgICBpbnRlcmFjdGlvbi5zaW11bGF0aW9uID0gbnVsbFxuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUluZXJ0aWFDb29yZHMgKGludGVyYWN0aW9uOiBJbnRlcmFjdC5JbnRlcmFjdGlvbikge1xuICBjb25zdCBzdGF0ZSA9IGludGVyYWN0aW9uLmluZXJ0aWFcblxuICAvLyByZXR1cm4gaWYgaW5lcnRpYSBpc24ndCBydW5uaW5nXG4gIGlmICghc3RhdGUuYWN0aXZlKSB7IHJldHVybiB9XG5cbiAgY29uc3QgcGFnZVVwICAgPSBzdGF0ZS51cENvb3Jkcy5wYWdlXG4gIGNvbnN0IGNsaWVudFVwID0gc3RhdGUudXBDb29yZHMuY2xpZW50XG5cbiAgdXRpbHMucG9pbnRlci5zZXRDb29yZHMoaW50ZXJhY3Rpb24uY29vcmRzLmN1ciwgWyB7XG4gICAgcGFnZVggIDogcGFnZVVwLnggICArIHN0YXRlLnN4LFxuICAgIHBhZ2VZICA6IHBhZ2VVcC55ICAgKyBzdGF0ZS5zeSxcbiAgICBjbGllbnRYOiBjbGllbnRVcC54ICsgc3RhdGUuc3gsXG4gICAgY2xpZW50WTogY2xpZW50VXAueSArIHN0YXRlLnN5LFxuICB9IF0sIGludGVyYWN0aW9uLl9ub3coKSlcbn1cblxuZnVuY3Rpb24gZ2V0T3B0aW9ucyAoeyBpbnRlcmFjdGFibGUsIHByZXBhcmVkIH06IEludGVyYWN0LkludGVyYWN0aW9uKSB7XG4gIHJldHVybiBpbnRlcmFjdGFibGUgJiZcbiAgICBpbnRlcmFjdGFibGUub3B0aW9ucyAmJlxuICAgIHByZXBhcmVkLm5hbWUgJiZcbiAgICBpbnRlcmFjdGFibGUub3B0aW9uc1twcmVwYXJlZC5uYW1lXS5pbmVydGlhXG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgaWQ6ICdpbmVydGlhJyxcbiAgaW5zdGFsbCxcbiAgY2FsY0luZXJ0aWEsXG4gIGluZXJ0aWFUaWNrLFxuICBzbW90aEVuZFRpY2ssXG4gIHVwZGF0ZUluZXJ0aWFDb29yZHMsXG59XG4iXX0=