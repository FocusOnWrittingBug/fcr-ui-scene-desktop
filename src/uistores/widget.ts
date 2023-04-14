import {
  AgoraMultiInstanceWidget,
  AgoraTrackSyncedWidget,
  AgoraViewportBoundaries,
  AgoraWidgetBase,
  AgoraWidgetLifecycle,
  AgoraWidgetTrackMode,
} from 'agora-common-libs/lib/widget';
import { WidgetState, AgoraWidgetTrack, AgoraWidgetController } from 'agora-edu-core';
import { bound, Log } from 'agora-rte-sdk';
import { action, computed, observable, reaction } from 'mobx';
import { EduUIStoreBase } from './base';
import { AgoraWidgetTrackController } from 'agora-common-libs/lib/widget/widget-track';
import { getLaunchOptions, getUiConfig, getTheme } from '@onlineclass/utils/launch-options-holder';
import { ToastApi } from '@components/toast';
import { AgoraExtensionWidgetEvent } from '@onlineclass/extension/events';

@Log.attach({ proxyMethods: false })
export class WidgetUIStore extends EduUIStoreBase {
  private _registeredWidgets: Record<string, typeof AgoraWidgetBase> = {};
  @observable
  private _widgetInstances: Record<string, AgoraWidgetBase> = {};

  private _stateListener = {
    onActive: this._handleWidgetActive,
    onInactive: this._handleWidgetInactive,
    onPropertiesUpdate: this._handlePropertiesUpdate,
    onUserPropertiesUpdate: this._handleUserPropertiesUpdate,
    onTrackUpdate: this._handleTrackUpdate,
  };

  @computed
  get ready() {
    return !!this.classroomStore.widgetStore.widgetController;
  }

  @computed
  get registeredWidgetNames() {
    return Object.keys(this._registeredWidgets);
  }

  @computed
  get widgetInstanceList() {
    return Object.values(this._widgetInstances);
  }

  @computed
  get z0Widgets() {
    return this.widgetInstanceList.filter(({ zContainer }) => zContainer === 0);
  }

  get z10Widgets() {
    return this.widgetInstanceList.filter(({ zContainer }) => zContainer === 10);
  }

  @action.bound
  createWidget(
    widgetId: string,
    defaults?: Record<'properties' | 'userProperties' | 'trackProperties', any>,
  ) {
    const [widgetName, instanceId] = this._extractWidgetNameId(widgetId);

    const WidgetClass = this._registeredWidgets[widgetName];

    if (!WidgetClass) {
      this.logger.info(`Widget [${widgetName}] is active but not registered`);
      return;
    }

    if (this._widgetInstances[widgetId]) {
      this.logger.info(`Widget [${widgetName}] is already active`);
      return;
    }

    const { widgetController } = this.classroomStore.widgetStore;

    if (widgetController) {
      const widget = new (WidgetClass as any)(
        widgetController,
        this.classroomStore,
        this._createUiCapable(),
        getUiConfig(),
        getTheme(),
      ) as AgoraWidgetBase;

      if (instanceId) {
        this._callWidgetSetInstanceId(widget, instanceId);
      }

      const trackProps =
        widgetController.getWidgetTrack(widget.widgetId) || (defaults?.trackProperties ?? {});

      const trackMode = this._getWidgetTrackMode(widget);

      if (trackMode) {
        const trackController = new AgoraWidgetTrackController(widget, trackProps, {
          posOnly: trackMode === AgoraWidgetTrackMode.TrackPositionOnly,
        });

        widget.setTrackController(trackController);
      }

      const props =
        widgetController?.getWidgetProperties(widget.widgetId) || (defaults?.properties ?? {});

      const userProps =
        widgetController?.getWidgetUserProperties(widget.widgetId) ||
        (defaults?.userProperties ?? {});

      this._callWidgetCreate(widget, props, userProps);

      this._widgetInstances[widgetId] = widget;
    } else {
      this.logger.info('Widget controller not ready for creating widget');
    }
  }

  @action.bound
  destroyWidget(widgetId: string) {
    const widget = this._widgetInstances[widgetId];
    if (widget) {
      if (widget.trackController) {
        widget.trackController.destory();
      }
      this._callWidgetDestroy(widget);
      delete this._widgetInstances[widgetId];
    }
  }

  private _extractWidgetNameId(widgetId: string) {
    const [widgetName, instanceId] = widgetId.split('-');
    return [widgetName, instanceId];
  }

  @bound
  private _handleWidgetActive(widgetId: string) {
    this.createWidget(widgetId);
  }

  @bound
  private _handleWidgetInactive(widgetId: string) {
    this.destroyWidget(widgetId);
  }

  @bound
  private _handlePropertiesUpdate(widgetId: string, props: unknown) {
    const widget = this._widgetInstances[widgetId];
    if (widget) {
      this._callWidgetPropertiesUpdate(widget, props);
    }
  }

  @bound
  private _handleUserPropertiesUpdate(widgetId: string, userProps: unknown) {
    const widget = this._widgetInstances[widgetId];
    if (widget) {
      this._callWidgetUserPropertiesUpdate(widget, userProps);
    }
  }

  @bound
  private _handleTrackUpdate(widgetId: string, trackProps: unknown) {
    const widget = this._widgetInstances[widgetId];
    if (widget) {
      this._callWidgetUpdateTrack(widget, trackProps);
    }
  }

  private _callWidgetCreate(widget: AgoraWidgetBase, props: unknown, userProps: unknown) {
    if ((widget as unknown as AgoraWidgetLifecycle).onCreate) {
      (widget as unknown as AgoraWidgetLifecycle).onCreate(props, userProps);
    }
  }

  private _callWidgetSetInstanceId(widget: AgoraWidgetBase, instanceId: string) {
    if ((widget as unknown as AgoraMultiInstanceWidget).setInstanceId) {
      (widget as unknown as AgoraMultiInstanceWidget).setInstanceId(instanceId);
    }
  }

  private _callWidgetPropertiesUpdate(widget: AgoraWidgetBase, props: unknown) {
    if ((widget as unknown as AgoraWidgetLifecycle).onPropertiesUpdate) {
      (widget as unknown as AgoraWidgetLifecycle).onPropertiesUpdate(props);
    }
  }
  private _callWidgetUserPropertiesUpdate(widget: AgoraWidgetBase, userProps: unknown) {
    if ((widget as unknown as AgoraWidgetLifecycle).onUserPropertiesUpdate) {
      (widget as unknown as AgoraWidgetLifecycle).onUserPropertiesUpdate(userProps);
    }
  }

  private _callWidgetDestroy(widget: AgoraWidgetBase) {
    if ((widget as unknown as AgoraWidgetLifecycle).onDestroy) {
      (widget as unknown as AgoraWidgetLifecycle).onDestroy();
    }
  }

  private _callWidgetUpdateTrack(widget: AgoraWidgetBase, trackProps: unknown) {
    if ((widget as unknown as AgoraTrackSyncedWidget).updateToLocal) {
      (widget as unknown as AgoraTrackSyncedWidget).updateToLocal(trackProps as AgoraWidgetTrack);
      (widget as unknown as AgoraTrackSyncedWidget).updateZIndexToLocal(
        (trackProps as AgoraWidgetTrack).zIndex ?? 0,
      );
    }
  }

  private _getWidgetTrackMode(widget: AgoraWidgetBase) {
    return (widget as unknown as AgoraTrackSyncedWidget).trackMode;
  }

  private _callWidgetInstall(widget: AgoraWidgetBase, controller: AgoraWidgetController) {
    if ((widget as unknown as AgoraWidgetLifecycle).onInstall) {
      (widget as unknown as AgoraWidgetLifecycle).onInstall(controller);
    }
  }

  private _callWidgetUninstall(widget: AgoraWidgetBase, controller: AgoraWidgetController) {
    if ((widget as unknown as AgoraWidgetLifecycle).onUninstall) {
      (widget as unknown as AgoraWidgetLifecycle).onUninstall(controller);
    }
  }

  private _installWidgets(controller: AgoraWidgetController) {
    Object.values(this._registeredWidgets).forEach((Clz) => {
      this._callWidgetInstall(Object.create(Clz.prototype), controller);
    });
  }

  private _uninstallWidgets(controller: AgoraWidgetController) {
    Object.values(this._registeredWidgets).forEach((Clz) => {
      this._callWidgetUninstall(Object.create(Clz.prototype), controller);
    });
  }

  @bound
  private _handleBecomeActive({
    widgetId,
    defaults,
  }: {
    widgetId: string;
    defaults: {
      properties: any;
      userProperties: any;
      trackProperties: any;
    };
  }) {
    this.createWidget(widgetId, defaults);
  }

  @bound
  private _handleBecomeInactive(widgetId: string) {
    this.destroyWidget(widgetId);
  }

  private _getEnabledWidgets() {
    const { widgets } = getLaunchOptions();

    return widgets || {};
  }

  private _createUiCapable() {
    return {
      addToast: (
        message: string,
        type: 'error' | 'success' | 'warning',
        options?: { persist?: boolean; duration?: number },
      ) => {
        const { persist, duration } = options || {};
        const toastTypeMap = {
          error: 'error' as const,
          success: 'normal' as const,
          warning: 'normal' as const,
        };

        ToastApi.open({
          persist,
          duration,
          toastProps: { type: toastTypeMap[type], content: message },
        });
      },
    };
  }

  @bound
  private _notifyViewportChange(boundaries?: AgoraViewportBoundaries) {
    if (boundaries) {
      this.widgetInstanceList.forEach((instance) => {
        instance.onViewportBoundaryUpdate(boundaries);
      });
    }
  }

  onInstall() {
    this._registeredWidgets = this._getEnabledWidgets();
    this.classroomStore.widgetStore.addWidgetStateListener(this._stateListener);
    // switch between widget controllers of scenes
    this._disposers.push(
      reaction(
        () => ({
          controller: this.classroomStore.widgetStore.widgetController,
          widgetIds: this.classroomStore.widgetStore.widgetController?.widgetIds,
          ready: this.getters.layoutReady,
        }),
        ({ widgetIds, ready, controller }) => {
          // wait until the layout is ready
          if (ready && controller) {
            widgetIds?.forEach((widgetId) => {
              const state = controller.getWidgetState(widgetId);

              if (state === WidgetState.Active || widgetId === 'easemobIM') {
                this._handleWidgetActive(widgetId);
              }
            });
          }
        },
      ),
    );

    this._disposers.push(
      computed(() => this.classroomStore.widgetStore.widgetController).observe(
        ({ oldValue: oldController, newValue: controller }) => {
          // destory all widget instances after switched to a new scene
          this.widgetInstanceList.forEach((instance) => {
            this._handleWidgetInactive(instance.widgetId);
          });
          // uninstall all installed widgets
          if (oldController) {
            this._uninstallWidgets(oldController);
            this.getters.boardApi.uninstall();
            this.getters.chatApi.uninstall();
            oldController.removeBroadcastListener({
              messageType: AgoraExtensionWidgetEvent.WidgetBecomeActive,
              onMessage: this._handleBecomeActive,
            });
            oldController.removeBroadcastListener({
              messageType: AgoraExtensionWidgetEvent.WidgetBecomeInactive,
              onMessage: this._handleBecomeInactive,
            });
          }
          // install widgets
          if (controller) {
            this.getters.boardApi.install(controller);
            this.getters.chatApi.install(controller);

            this._installWidgets(controller);

            controller.addBroadcastListener({
              messageType: AgoraExtensionWidgetEvent.WidgetBecomeActive,
              onMessage: this._handleBecomeActive,
            });
            controller.addBroadcastListener({
              messageType: AgoraExtensionWidgetEvent.WidgetBecomeInactive,
              onMessage: this._handleBecomeInactive,
            });
          }
        },
      ),
    );

    this._disposers.push(
      reaction(() => this.getters.viewportBoundaries, this._notifyViewportChange),
    );
  }

  onDestroy() {
    this.classroomStore.widgetStore.removeWidgetStateListener(this._stateListener);
    this._disposers.forEach((d) => d());
    this._disposers = [];
  }
}
