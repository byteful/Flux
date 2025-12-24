import NetInfo from '@react-native-community/netinfo';

class NetworkMonitor {
  constructor() {
    this.state = {
      isConnected: false,
      isWifi: false,
      isCellular: false,
      type: null,
    };
    this.subscribers = new Set();
    this.unsubscribe = null;
    this.isStarted = false;
  }

  async start() {
    if (this.isStarted) return;

    const initialState = await NetInfo.fetch();
    this.updateState(initialState);

    this.unsubscribe = NetInfo.addEventListener(state => {
      this.updateState(state);
    });

    this.isStarted = true;
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isStarted = false;
  }

  updateState(netInfoState) {
    const previousState = { ...this.state };

    this.state = {
      isConnected: netInfoState.isConnected ?? false,
      isWifi: netInfoState.type === 'wifi',
      isCellular: netInfoState.type === 'cellular',
      type: netInfoState.type,
    };

    if (
      previousState.isConnected !== this.state.isConnected ||
      previousState.isWifi !== this.state.isWifi ||
      previousState.isCellular !== this.state.isCellular
    ) {
      this.notifySubscribers();
    }
  }

  getState() {
    return { ...this.state };
  }

  isOnline() {
    return this.state.isConnected;
  }

  isOnWifi() {
    return this.state.isConnected && this.state.isWifi;
  }

  isOnCellular() {
    return this.state.isConnected && this.state.isCellular;
  }

  canDownload(wifiOnlyEnabled = true) {
    if (!this.state.isConnected) {
      return false;
    }
    if (wifiOnlyEnabled && !this.state.isWifi) {
      return false;
    }
    return true;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.state);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notifySubscribers() {
    this.subscribers.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('NetworkMonitor subscriber error:', error);
      }
    });
  }

  async refresh() {
    try {
      const state = await NetInfo.fetch();
      this.updateState(state);
      return this.state;
    } catch (error) {
      console.error('NetworkMonitor refresh error:', error);
      return this.state;
    }
  }
}

const networkMonitor = new NetworkMonitor();
export default networkMonitor;
