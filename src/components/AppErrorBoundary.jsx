import React from 'react';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Unexpected UI error'
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-fatal-state">
          <h1>Interface Error</h1>
          <p>The app hit a rendering error and could not continue safely.</p>
          <p className="fatal-message">{this.state.message}</p>
          <button type="button" onClick={this.handleReload}>Reload App</button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
