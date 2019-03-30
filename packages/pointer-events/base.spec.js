import test from '@interactjs/_dev/test/test';
import Eventable from '@interactjs/core/Eventable';
import Interaction from '@interactjs/core/Interaction';
import * as helpers from '@interactjs/core/tests/_helpers';
import pointerEvents from './base';
import interactableTargets from './interactableTargets';
test('pointerEvents.types', (t) => {
    t.deepEqual(pointerEvents.types, [
        'down',
        'move',
        'up',
        'cancel',
        'tap',
        'doubletap',
        'hold',
    ], 'pointerEvents.types is as expected');
    t.end();
});
test('pointerEvents.fire', (t) => {
    const scope = helpers.mockScope();
    const eventable = new Eventable(pointerEvents.defaults);
    const type = 'TEST';
    const element = {};
    const eventTarget = {};
    const TEST_PROP = ['TEST_PROP'];
    let firedEvent;
    eventable.on(type, (event) => { firedEvent = event; });
    pointerEvents.fire({
        type,
        eventTarget,
        pointer: {},
        event: {},
        interaction: {},
        targets: [{
                eventable,
                element,
                props: {
                    TEST_PROP,
                },
            }],
    }, scope);
    t.ok(firedEvent instanceof pointerEvents.PointerEvent, 'Fired event is an instance of pointerEvents.PointerEvent');
    t.equal(firedEvent.type, type, 'Fired event type is correct');
    t.equal(firedEvent.currentTarget, element, 'Fired event currentTarget is correct');
    t.equal(firedEvent.target, eventTarget, 'Fired event target is correct');
    t.equal(firedEvent.TEST_PROP, TEST_PROP, 'Fired event has props from target.props');
    const tapTime = 500;
    const interaction = Object.assign(scope.interactions.new({}), { tapTime: -1, prevTap: null });
    interaction.updatePointer({}, {}, null);
    const tapEvent = Object.assign(new pointerEvents.PointerEvent('tap', {}, {}, null, interaction, 0), {
        timeStamp: tapTime,
    });
    pointerEvents.fire({
        pointerEvent: tapEvent,
        interaction,
        targets: [{
                eventable,
                element,
            }],
    }, scope);
    t.equal(interaction.tapTime, tapTime, 'interaction.tapTime is updated');
    t.equal(interaction.prevTap, tapEvent, 'interaction.prevTap is updated');
    t.end();
});
test('pointerEvents.collectEventTargets', (t) => {
    const type = 'TEST';
    const TEST_PROP = ['TEST_PROP'];
    const target = {
        TEST_PROP,
        eventable: new Eventable(pointerEvents.defaults),
    };
    let collectedTargets;
    function onCollect({ targets }) {
        targets.push(target);
        collectedTargets = targets;
    }
    pointerEvents.signals.on('collect-targets', onCollect);
    pointerEvents.collectEventTargets({
        interaction: new Interaction({ signals: helpers.mockSignals() }),
        pointer: {},
        event: {},
        eventTarget: {},
        type,
    });
    t.deepEqual(collectedTargets, [target]);
    pointerEvents.signals.off('collect-targets', onCollect);
    t.end();
});
test('pointerEvents Interaction update-pointer signal', (t) => {
    const scope = helpers.mockScope();
    pointerEvents.install(scope);
    const interaction = scope.interactions.new({});
    const initialHold = { duration: Infinity, timeout: null };
    const event = {};
    interaction.updatePointer(helpers.newPointer(0), event, null, false);
    t.deepEqual(interaction.pointers.map((p) => p.hold), [initialHold], 'set hold info for move on new pointer');
    interaction.removePointer(helpers.newPointer(0), event);
    interaction.updatePointer(helpers.newPointer(0), event, null, true);
    t.deepEqual(interaction.pointers.map((p) => p.hold), [initialHold]);
    interaction.updatePointer(helpers.newPointer(5), event, null, true);
    t.deepEqual(interaction.pointers.map((p) => p.hold), [initialHold, initialHold]);
    t.end();
});
test('pointerEvents Interaction remove-pointer signal', (t) => {
    const scope = helpers.mockScope();
    pointerEvents.install(scope);
    const interaction = scope.interactions.new({});
    const ids = [0, 1, 2, 3];
    const removals = [
        { id: 0, remain: [1, 2, 3], message: 'first of 4' },
        { id: 2, remain: [1, 3], message: 'middle of 3' },
        { id: 3, remain: [1], message: 'last of 2' },
        { id: 1, remain: [], message: 'final' },
    ];
    for (const id of ids) {
        const index = interaction.updatePointer({ pointerId: id }, {}, null, true);
        // use the ids as the pointerInfo.hold value for this test
        interaction.pointers[index].hold = id;
    }
    for (const removal of removals) {
        interaction.removePointer({ pointerId: removal.id }, null);
        t.deepEqual(interaction.pointers.map((p) => p.hold), removal.remain, `${removal.message} - remaining interaction.holdTimers is correct`);
    }
    t.end();
});
test('pointerEvents down move up tap', (t) => {
    const { scope, interaction, event, } = helpers.testEnv({ plugins: [pointerEvents, interactableTargets] });
    const interactable = scope.interactables.new(event.target);
    const fired = [];
    for (const type of pointerEvents.types) {
        interactable.on(type, (e) => fired.push(e));
    }
    interaction.pointerDown(event, event, event.target);
    interaction.pointerMove(event, event, event.target);
    t.deepEqual(fired.map((e) => e.type), ['down'], 'duplicate move event is not fired');
    interaction.pointerUp(event, event, scope.document.body, event.target);
    t.deepEqual(fired.map((e) => e.type), ['down', 'up', 'tap'], 'tap event is fired after down and up event');
    t.end();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5zcGVjLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFzZS5zcGVjLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sSUFBSSxNQUFNLDRCQUE0QixDQUFBO0FBQzdDLE9BQU8sU0FBUyxNQUFNLDRCQUE0QixDQUFBO0FBQ2xELE9BQU8sV0FBVyxNQUFNLDhCQUE4QixDQUFBO0FBQ3RELE9BQU8sS0FBSyxPQUFPLE1BQU0saUNBQWlDLENBQUE7QUFDMUQsT0FBTyxhQUFhLE1BQU0sUUFBUSxDQUFBO0FBQ2xDLE9BQU8sbUJBQW1CLE1BQU0sdUJBQXVCLENBQUE7QUFFdkQsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUU7SUFDaEMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUM3QjtRQUNFLE1BQU07UUFDTixNQUFNO1FBQ04sSUFBSTtRQUNKLFFBQVE7UUFDUixLQUFLO1FBQ0wsV0FBVztRQUNYLE1BQU07S0FDUCxFQUNELG9DQUFvQyxDQUFDLENBQUE7SUFFdkMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFBO0FBQ1QsQ0FBQyxDQUFDLENBQUE7QUFFRixJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRTtJQUMvQixNQUFNLEtBQUssR0FBbUIsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFBO0lBRWpELE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQTtJQUN2RCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUE7SUFDbkIsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFBO0lBQ2xCLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQTtJQUN0QixNQUFNLFNBQVMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBQy9CLElBQUksVUFBVSxDQUFBO0lBRWQsU0FBUyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFL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QUFDLEVBQ3hCLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsRUFDckIsNENBQTRDLENBQUMsQ0FBQTtJQUUvQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUE7QUFDVCxDQUFDLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0ZXN0IGZyb20gJ0BpbnRlcmFjdGpzL19kZXYvdGVzdC90ZXN0J1xuaW1wb3J0IEV2ZW50YWJsZSBmcm9tICdAaW50ZXJhY3Rqcy9jb3JlL0V2ZW50YWJsZSdcbmltcG9ydCBJbnRlcmFjdGlvbiBmcm9tICdAaW50ZXJhY3Rqcy9jb3JlL0ludGVyYWN0aW9uJ1xuaW1wb3J0ICogYXMgaGVscGVycyBmcm9tICdAaW50ZXJhY3Rqcy9jb3JlL3Rlc3RzL19oZWxwZXJzJ1xuaW1wb3J0IHBvaW50ZXJFdmVudHMgZnJvbSAnLi9iYXNlJ1xuaW1wb3J0IGludGVyYWN0YWJsZVRhcmdldHMgZnJvbSAnLi9pbnRlcmFjdGFibGVUYXJnZXRzJ1xuXG50ZXN0KCdwb2ludGVyRXZlbnRzLnR5cGVzJywgKHQpID0+IHtcbiAgdC5kZWVwRXF1YWwocG9pbnRlckV2ZW50cy50eXBlcyxcbiAgICBbXG4gICAgICAnZG93bicsXG4gICAgICAnbW92ZScsXG4gICAgICAndXAnLFxuICAgICAgJ2NhbmNlbCcsXG4gICAgICAndGFwJyxcbiAgICAgICdkb3VibGV0YXAnLFxuICAgICAgJ2hvbGQnLFxuICAgIF0sXG4gICAgJ3BvaW50ZXJFdmVudHMudHlwZXMgaXMgYXMgZXhwZWN0ZWQnKVxuXG4gIHQuZW5kKClcbn0pXG5cbnRlc3QoJ3BvaW50ZXJFdmVudHMuZmlyZScsICh0KSA9PiB7XG4gIGNvbnN0IHNjb3BlOiBJbnRlcmFjdC5TY29wZSA9IGhlbHBlcnMubW9ja1Njb3BlKClcblxuICBjb25zdCBldmVudGFibGUgPSBuZXcgRXZlbnRhYmxlKHBvaW50ZXJFdmVudHMuZGVmYXVsdHMpXG4gIGNvbnN0IHR5cGUgPSAnVEVTVCdcbiAgY29uc3QgZWxlbWVudCA9IHt9XG4gIGNvbnN0IGV2ZW50VGFyZ2V0ID0ge31cbiAgY29uc3QgVEVTVF9QUk9QID0gWydURVNUX1BST1AnXVxuICBsZXQgZmlyZWRFdmVudFxuXG4gIGV2ZW50YWJsZS5vbih0eXBlLCAoZXZlbnQpID0+IHsgZmlyZWRFdmVudCA9IGV2ZW50IH0pXG5cbiAgcG9pbnRlckV2ZW50cy5maXJlKHtcbiAgICB0eXBlLFxuICAgIGV2ZW50VGFyZ2V0LFxuICAgIHBvaW50ZXI6IHt9LFxuICAgIGV2ZW50OiB7fSxcbiAgICBpbnRlcmFjdGlvbjoge30sXG4gICAgdGFyZ2V0czogW3tcbiAgICAgIGV2ZW50YWJsZSxcbiAgICAgIGVsZW1lbnQsXG4gICAgICBwcm9wczoge1xuICAgICAgICBURVNUX1BST1AsXG4gICAgICB9LFxuICAgIH1dLFxuICB9IGFzIGFueSwgc2NvcGUpXG5cbiAgdC5vayhmaXJlZEV2ZW50IGluc3RhbmNlb2YgcG9pbnRlckV2ZW50cy5Qb2ludGVyRXZlbnQsXG4gICAgJ0ZpcmVkIGV2ZW50IGlzIGFuIGluc3RhbmNlIG9mIHBvaW50ZXJFdmVudHMuUG9pbnRlckV2ZW50JylcbiAgdC5lcXVhbChmaXJlZEV2ZW50LnR5cGUsIHR5cGUsXG4gICAgJ0ZpcmVkIGV2ZW50IHR5cGUgaXMgY29ycmVjdCcpXG4gIHQuZXF1YWwoZmlyZWRFdmVudC5jdXJyZW50VGFyZ2V0LCBlbGVtZW50LFxuICAgICdGaXJlZCBldmVudCBjdXJyZW50VGFyZ2V0IGlzIGNvcnJlY3QnKVxuICB0LmVxdWFsKGZpcmVkRXZlbnQudGFyZ2V0LCBldmVudFRhcmdldCxcbiAgICAnRmlyZWQgZXZlbnQgdGFyZ2V0IGlzIGNvcnJlY3QnKVxuICB0LmVxdWFsKGZpcmVkRXZlbnQuVEVTVF9QUk9QLCBURVNUX1BST1AsXG4gICAgJ0ZpcmVkIGV2ZW50IGhhcyBwcm9wcyBmcm9tIHRhcmdldC5wcm9wcycpXG5cbiAgY29uc3QgdGFwVGltZSA9IDUwMFxuICBjb25zdCBpbnRlcmFjdGlvbiA9IE9iamVjdC5hc3NpZ24oXG4gICAgc2NvcGUuaW50ZXJhY3Rpb25zLm5ldyh7fSksXG4gICAgeyB0YXBUaW1lOiAtMSwgcHJldlRhcDogbnVsbCB9KVxuXG4gIGludGVyYWN0aW9uLnVwZGF0ZVBvaW50ZXIoe30gYXMgYW55LCB7fSBhcyBhbnksIG51bGwpXG5cbiAgY29uc3QgdGFwRXZlbnQgPSBPYmplY3QuYXNzaWduKG5ldyBwb2ludGVyRXZlbnRzLlBvaW50ZXJFdmVudCgndGFwJywge30gYXMgYW55LCB7fSBhcyBhbnksIG51bGwsIGludGVyYWN0aW9uLCAwKSwge1xuICAgIHRpbWVTdGFtcDogdGFwVGltZSxcbiAgfSlcblxuICBwb2ludGVyRXZlbnRzLmZpcmUoe1xuICAgIHBvaW50ZXJFdmVudDogdGFwRXZlbnQsXG4gICAgaW50ZXJhY3Rpb24sXG4gICAgdGFyZ2V0czogW3tcbiAgICAgIGV2ZW50YWJsZSxcbiAgICAgIGVsZW1lbnQsXG4gICAgfV0sXG4gIH0gYXMgYW55LCBzY29wZSlcblxuICB0LmVxdWFsKGludGVyYWN0aW9uLnRhcFRpbWUsIHRhcFRpbWUsXG4gICAgJ2ludGVyYWN0aW9uLnRhcFRpbWUgaXMgdXBkYXRlZCcpXG4gIHQuZXF1YWwoaW50ZXJhY3Rpb24ucHJldlRhcCwgdGFwRXZlbnQsXG4gICAgJ2ludGVyYWN0aW9uLnByZXZUYXAgaXMgdXBkYXRlZCcpXG5cbiAgdC5lbmQoKVxufSlcblxudGVzdCgncG9pbnRlckV2ZW50cy5jb2xsZWN0RXZlbnRUYXJnZXRzJywgKHQpID0+IHtcbiAgY29uc3QgdHlwZSA9ICdURVNUJ1xuICBjb25zdCBURVNUX1BST1AgPSBbJ1RFU1RfUFJPUCddXG4gIGNvbnN0IHRhcmdldCA9IHtcbiAgICBURVNUX1BST1AsXG4gICAgZXZlbnRhYmxlOiBuZXcgRXZlbnRhYmxlKHBvaW50ZXJFdmVudHMuZGVmYXVsdHMpLFxuICB9XG4gIGxldCBjb2xsZWN0ZWRUYXJnZXRzXG5cbiAgZnVuY3Rpb24gb25Db2xsZWN0ICh7IHRhcmdldHMgfSkge1xuICAgIHRhcmdldHMucHVzaCh0YXJnZXQpXG5cbiAgICBjb2xsZWN0ZWRUYXJnZXRzID0gdGFyZ2V0c1xuICB9XG5cbiAgcG9pbnRlckV2ZW50cy5zaWduYWxzLm9uKCdjb2xsZWN0LXRhcmdldHMnLCBvbkNvbGxlY3QpXG4gIHBvaW50ZXJFdmVudHMuY29sbGVjdEV2ZW50VGFyZ2V0cyh7XG4gICAgaW50ZXJhY3Rpb246IG5ldyBJbnRlcmFjdGlvbih7IHNpZ25hbHM6IGhlbHBlcnMubW9ja1NpZ25hbHMoKSB9IGFzIGFueSksXG4gICAgcG9pbnRlcjoge30sXG4gICAgZXZlbnQ6IHt9LFxuICAgIGV2ZW50VGFyZ2V0OiB7fSxcbiAgICB0eXBlLFxuICB9IGFzIGFueSlcblxuICB0LmRlZXBFcXVhbChjb2xsZWN0ZWRUYXJnZXRzLCBbdGFyZ2V0XSlcblxuICBwb2ludGVyRXZlbnRzLnNpZ25hbHMub2ZmKCdjb2xsZWN0LXRhcmdldHMnLCBvbkNvbGxlY3QpXG5cbiAgdC5lbmQoKVxufSlcblxudGVzdCgncG9pbnRlckV2ZW50cyBJbnRlcmFjdGlvbiB1cGRhdGUtcG9pbnRlciBzaWduYWwnLCAodCkgPT4ge1xuICBjb25zdCBzY29wZTogSW50ZXJhY3QuU2NvcGUgPSBoZWxwZXJzLm1vY2tTY29wZSgpXG5cbiAgcG9pbnRlckV2ZW50cy5pbnN0YWxsKHNjb3BlKVxuXG4gIGNvbnN0IGludGVyYWN0aW9uID0gc2NvcGUuaW50ZXJhY3Rpb25zLm5ldyh7fSlcbiAgY29uc3QgaW5pdGlhbEhvbGQgPSB7IGR1cmF0aW9uOiBJbmZpbml0eSwgdGltZW91dDogbnVsbCB9XG4gIGNvbnN0IGV2ZW50ID0ge30gYXMgSW50ZXJhY3QuUG9pbnRlckV2ZW50VHlwZVxuXG4gIGludGVyYWN0aW9uLnVwZGF0ZVBvaW50ZXIoaGVscGVycy5uZXdQb2ludGVyKDApLCBldmVudCwgbnVsbCwgZmFsc2UpXG4gIHQuZGVlcEVxdWFsKGludGVyYWN0aW9uLnBvaW50ZXJzLm1hcCgocCkgPT4gcC5ob2xkKSwgW2luaXRpYWxIb2xkXSwgJ3NldCBob2xkIGluZm8gZm9yIG1vdmUgb24gbmV3IHBvaW50ZXInKVxuXG4gIGludGVyYWN0aW9uLnJlbW92ZVBvaW50ZXIoaGVscGVycy5uZXdQb2ludGVyKDApLCBldmVudClcblxuICBpbnRlcmFjdGlvbi51cGRhdGVQb2ludGVyKGhlbHBlcnMubmV3UG9pbnRlcigwKSwgZXZlbnQsIG51bGwsIHRydWUpXG4gIHQuZGVlcEVxdWFsKGludGVyYWN0aW9uLnBvaW50ZXJzLm1hcCgocCkgPT4gcC5ob2xkKSwgW2luaXRpYWxIb2xkXSlcblxuICBpbnRlcmFjdGlvbi51cGRhdGVQb2ludGVyKGhlbHBlcnMubmV3UG9pbnRlcig1KSwgZXZlbnQsIG51bGwsIHRydWUpXG4gIHQuZGVlcEVxdWFsKGludGVyYWN0aW9uLnBvaW50ZXJzLm1hcCgocCkgPT4gcC5ob2xkKSwgW2luaXRpYWxIb2xkLCBpbml0aWFsSG9sZF0pXG5cbiAgdC5lbmQoKVxufSlcblxudGVzdCgncG9pbnRlckV2ZW50cyBJbnRlcmFjdGlvbiByZW1vdmUtcG9pbnRlciBzaWduYWwnLCAodCkgPT4ge1xuICBjb25zdCBzY29wZTogSW50ZXJhY3QuU2NvcGUgPSBoZWxwZXJzLm1vY2tTY29wZSgpXG5cbiAgcG9pbnRlckV2ZW50cy5pbnN0YWxsKHNjb3BlKVxuXG4gIGNvbnN0IGludGVyYWN0aW9uID0gc2NvcGUuaW50ZXJhY3Rpb25zLm5ldyh7fSlcblxuICBjb25zdCBpZHMgPSBbMCwgMSwgMiwgM11cbiAgY29uc3QgcmVtb3ZhbHMgPSBbXG4gICAgeyBpZDogMCwgcmVtYWluOiBbMSwgMiwgM10sIG1lc3NhZ2U6ICdmaXJzdCBvZiA0JyAgfSxcbiAgICB7IGlkOiAyLCByZW1haW46IFsxLCAgICAzXSwgbWVzc2FnZTogJ21pZGRsZSBvZiAzJyB9LFxuICAgIHsgaWQ6IDMsIHJlbWFpbjogWzEgICAgICBdLCBtZXNzYWdlOiAnbGFzdCBvZiAyJyAgIH0sXG4gICAgeyBpZDogMSwgcmVtYWluOiBbICAgICAgIF0sIG1lc3NhZ2U6ICdmaW5hbCcgICAgICAgfSxcbiAgXVxuXG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgaW5kZXggPSBpbnRlcmFjdGlvbi51cGRhdGVQb2ludGVyKHsgcG9pbnRlcklkOiBpZCB9IGFzIEludGVyYWN0LlBvaW50ZXJUeXBlLCB7fSBhcyBJbnRlcmFjdC5Qb2ludGVyRXZlbnRUeXBlLCBudWxsLCB0cnVlKVxuICAgIC8vIHVzZSB0aGUgaWRzIGFzIHRoZSBwb2ludGVySW5mby5ob2xkIHZhbHVlIGZvciB0aGlzIHRlc3RcbiAgICBpbnRlcmFjdGlvbi5wb2ludGVyc1tpbmRleF0uaG9sZCA9IGlkIGFzIGFueVxuICB9XG5cbiAgZm9yIChjb25zdCByZW1vdmFsIG9mIHJlbW92YWxzKSB7XG4gICAgaW50ZXJhY3Rpb24ucmVtb3ZlUG9pbnRlcih7IHBvaW50ZXJJZDogcmVtb3ZhbC5pZCB9IGFzIGFueSwgbnVsbClcblxuICAgIHQuZGVlcEVxdWFsKGludGVyYWN0aW9uLnBvaW50ZXJzLm1hcCgocCkgPT4gcC5ob2xkIGFzIHVua25vd24gYXMgbnVtYmVyKSwgcmVtb3ZhbC5yZW1haW4sXG4gICAgICBgJHtyZW1vdmFsLm1lc3NhZ2V9IC0gcmVtYWluaW5nIGludGVyYWN0aW9uLmhvbGRUaW1lcnMgaXMgY29ycmVjdGApXG4gIH1cblxuICB0LmVuZCgpXG59KVxuXG50ZXN0KCdwb2ludGVyRXZlbnRzIGRvd24gbW92ZSB1cCB0YXAnLCAodCkgPT4ge1xuICBjb25zdCB7XG4gICAgc2NvcGUsXG4gICAgaW50ZXJhY3Rpb24sXG4gICAgZXZlbnQsXG4gIH0gPSBoZWxwZXJzLnRlc3RFbnYoeyBwbHVnaW5zOiBbcG9pbnRlckV2ZW50cywgaW50ZXJhY3RhYmxlVGFyZ2V0cyBdIH0pXG5cbiAgY29uc3QgaW50ZXJhY3RhYmxlID0gc2NvcGUuaW50ZXJhY3RhYmxlcy5uZXcoZXZlbnQudGFyZ2V0KVxuICBjb25zdCBmaXJlZDogRXZlbnRbXSA9IFtdXG5cbiAgZm9yIChjb25zdCB0eXBlIG9mIHBvaW50ZXJFdmVudHMudHlwZXMpIHtcbiAgICBpbnRlcmFjdGFibGUub24odHlwZSwgKGUpID0+IGZpcmVkLnB1c2goZSkpXG4gIH1cblxuICBpbnRlcmFjdGlvbi5wb2ludGVyRG93bihldmVudCwgZXZlbnQsIGV2ZW50LnRhcmdldClcbiAgaW50ZXJhY3Rpb24ucG9pbnRlck1vdmUoZXZlbnQsIGV2ZW50LCBldmVudC50YXJnZXQpXG5cbiAgdC5kZWVwRXF1YWwoXG4gICAgZmlyZWQubWFwKChlKSA9PiBlLnR5cGUpLFxuICAgIFsnZG93biddLFxuICAgICdkdXBsaWNhdGUgbW92ZSBldmVudCBpcyBub3QgZmlyZWQnKVxuXG4gIGludGVyYWN0aW9uLnBvaW50ZXJVcChldmVudCwgZXZlbnQsIHNjb3BlLmRvY3VtZW50LmJvZHksIGV2ZW50LnRhcmdldClcblxuICB0LmRlZXBFcXVhbChcbiAgICBmaXJlZC5tYXAoKGUpID0+IGUudHlwZSksXG4gICAgWydkb3duJywgJ3VwJywgJ3RhcCddLFxuICAgICd0YXAgZXZlbnQgaXMgZmlyZWQgYWZ0ZXIgZG93biBhbmQgdXAgZXZlbnQnKVxuXG4gIHQuZW5kKClcbn0pXG4iXX0=