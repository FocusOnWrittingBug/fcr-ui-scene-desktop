import { action, computed, observable, reaction } from 'mobx';
import { EduUIStoreBase } from './base';
import { EduStreamUI } from '@onlineclass/utils/stream/struct';
import { EduRoleTypeEnum } from 'agora-edu-core';
export class GalleryUIStore extends EduUIStoreBase {
  @observable mainViewStreamUuid: string | null = null;
  pageSize = 20;
  @observable currentPage = 1;
  @computed
  get mainViewStream() {
    if (!this.mainViewStreamUuid) return null;
    const stream = this.classroomStore.streamStore.streamByStreamUuid.get(this.mainViewStreamUuid);
    if (stream) return new EduStreamUI(stream);
    return null;
  }
  @computed get showPager() {
    return this.totalPage > 1;
  }
  @computed get totalPage() {
    return Math.ceil(this.cameraUIStreamsSortByPin.length / this.pageSize);
  }
  @computed get streamsByPage() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const currentPageStreams = this.cameraUIStreamsSortByPin.slice(start, end);
    const needFill =
      this.cameraUIStreamsSortByPin.length > this.pageSize &&
      start + currentPageStreams.length >= this.cameraUIStreamsSortByPin.length;
    let list = [];
    if (needFill) {
      list = this.cameraUIStreamsSortByPin.slice(
        this.cameraUIStreamsSortByPin.length - this.pageSize,
        this.cameraUIStreamsSortByPin.length,
      );
    } else {
      list = currentPageStreams;
    }
    return list;
  }
  @computed get cameraUIStreamsSortByPin() {
    return this.getters.cameraUIStreams.slice().sort((a, b) => {
      if (a.role === EduRoleTypeEnum.teacher) {
        return -1;
      }
      if (a.stream.streamUuid === this.getters.pinnedUIStream?.stream.streamUuid) {
        return -1;
      }
      if (b.stream.streamUuid === this.getters.pinnedUIStream?.stream.streamUuid) {
        return 1;
      }
      return 0;
    });
  }
  @action.bound
  setCurrentPage(page: number) {
    this.currentPage = page;
  }
  @action.bound
  private _handleMainCameraStream() {
    if (!this.getters.screenShareUIStream) {
      if (this.getters.cameraUIStreams.length === 1) {
        this.mainViewStreamUuid = this.getters.cameraUIStreams[0].stream.streamUuid;
      } else {
        this.mainViewStreamUuid = null;
      }
    }
  }
  onDestroy(): void {
    this._disposers.forEach((d) => d());
    this._disposers = [];
  }
  onInstall(): void {
    this._disposers.push(
      reaction(
        () => this.totalPage,
        (totalPage) => {
          if (this.currentPage > totalPage) this.setCurrentPage(totalPage <= 0 ? 1 : totalPage);
        },
      ),
    );
    this._disposers.push(
      reaction(() => {
        return this.getters.cameraUIStreams;
      }, this._handleMainCameraStream),
    );
  }
}
