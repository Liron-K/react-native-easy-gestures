import React, { Component } from 'react';
import PropTypes from 'prop-types'
import { PanResponder, View } from 'react-native';
import _ from 'underscore'

// Utils
import { angle, distance } from './utils/math.js';
import { getAngle, getScale, getTouches, isMultiTouch } from './utils/events.js';

export default class Gestures extends Component {

  static defaultProps = {
    children: {},
    draggable: true,
    rotatable: true,
    scalable: true,
    minScale: 0.33,
    maxScale: 2,
    scaleFactor: 1,
    rotateFactor: 1,
    positionFactor: 1,
    onStart: () => {},
    onChange: () => {},
    onRelease: () => {},
    styles: {
      left: 0,
      top: 0,
      transform: [
        { rotate: '0deg' },
        { scale: 1 },
      ],
    },
    shouldAllowTermination:false
  }

  static propTypes = {
    children: PropTypes.object,
    // Options
    draggable: PropTypes.bool,
    rotatable: PropTypes.bool,
    scalable: PropTypes.bool,
    // Min, Max scale
    minScale: PropTypes.number,
    maxScale: PropTypes.number,
    // Sensitivity
    scaleFactor: PropTypes.number,
    rotateFactor: PropTypes.number,
    positionFactor: PropTypes.number,
    parentSize: PropTypes.object,
    // Styles
    styles: PropTypes.object,
    // Callbacks
    onStart: PropTypes.func,
    onChange: PropTypes.func,
    onRelease: PropTypes.func,
    pointerEvents: PropTypes.string,

    shouldAllowTermination: PropTypes.bool,
  };

  constructor(props) {
    super(props);

    let styles = undefined
    if(props.styles)
    {
      styles = {
        ...Gestures.defaultProps.styles,
        ...props.styles
      }
    }
    else {
      styles = {
        ...Gestures.defaultProps.styles
      }
    }
    this.state = {
      styles
    }
  }

  isDisabled() {
    return !this.props.draggable &&
      !this.props.scalable && 
      !this.props.rotatable;
  }

  componentDidUpdate(lastProps, lastState)
  {
    if(this.props.styles != lastProps.styles)
    {
      this.dragStyles = {}
      this.pinchStyles = {}
      this.updateStyles();
    }
  }

  onMoveShouldSetPanResponder = (event, gestureState) => {
    console.tron.log('onMoveShouldSetPanResponder')
    return gestureState.dx !== 0 && gestureState.dy !== 0
  }
  onPanResponderTerminationRequest = (event, gestureState) => {
    console.tron.log('onPanResponderTerminationRequest')
    return this.props.shouldAllowTermination
  }
  componentWillMount() {
    this.pan = PanResponder.create({
      onPanResponderGrant: this.onMoveStart.bind(this),
      onPanResponderMove: this.onMove.bind(this),
      onPanResponderRelease: this.onMoveEnd.bind(this),

      onShouldBlockNativeResponder: () => true,
      onStartShouldSetPanResponder: () => this.onStartShouldSetPanResponder.bind(this),
      onMoveShouldSetPanResponder: this.onMoveShouldSetPanResponder.bind(this),
      onPanResponderTerminationRequest: this.onPanResponderTerminationRequest.bind(this),
    });
  }

  onStartShouldSetPanResponder = (event) => {
    if(this.isDisabled()) {
      return false
    }
    return true
  }

  onMoveStart = (event) => {
    if(this.isDisabled()) {
      return
    }
    const { styles } = this.state;
    const { onStart } = this.props;

    this.prevAngle = 0;
    this.prevDistance = 0;
    this.initialTouchesAngle = 0;
    this.pinchStyles = {};
    this.dragStyles = {};

    this.initialTouches = getTouches(event);
    this.initialAngle = undefined
    this.initialStyles = styles;

    // Callback
    if (onStart) {
      onStart(event, styles);
    }
  }

  onMove = (event, gestureState) => {

    if(this.isDisabled()) {
      return
    }
    
    const { styles } = this.state;
    const { onChange } = this.props;

    const { initialTouches } = this;

    const newTouches = getTouches(event);
    if (!this.initialTouches ||
      newTouches.length !== initialTouches.length) {
      this.initialTouches = newTouches;
    } else {
      this.onDrag(event, gestureState);
      this.onPinch(event);
    }

    this.updateStyles();

    // Callback
    if (onChange) {
      onChange(event, styles);
    }
  }

  onMoveEnd = (event) => {
    const { onRelease } = this.props;
    const { styles } = this.state;

    // Callback
    if (onRelease) {
      onRelease(event, styles);
    }
  }

  onDrag = (event, gestureState) => {
    const { initialStyles } = this;
    const { draggable } = this.props;

    if (draggable) {

      let left = initialStyles.left;

      const size = this.props.parentSize ? this.props.parentSize : this.state.size;

      if(_.isString(initialStyles.left) && initialStyles.left.endsWith('%'))
      {
        const percentChange = gestureState.dx / size.width * 100 * this.props.positionFactor;
        const oldLeftPct = parseFloat(initialStyles.left)
        left = (percentChange + oldLeftPct) + "%"
      }
      else {
        left = left + gestureState.dx
      }

      let top = initialStyles.top;
      if(_.isString(initialStyles.top) && initialStyles.top.endsWith('%'))
      {
        const percentChange = gestureState.dy / size.height * 100 * this.props.positionFactor;
        const oldTop = initialStyles.top;
        const oldTopPct = parseFloat(oldTop)
        top = (percentChange + oldTopPct) + "%"
      }
      else {
        top = top + gestureState.dy
      }
      this.dragStyles = {
        left,
        top
      };
    }
  }

  onPinch = (event) => {
    const { rotatable, scalable,
      minScale, maxScale,
      rotateFactor, scaleFactor } = this.props;
    const { styles } = this.state;
    const { initialTouches } = this;

    if (isMultiTouch(event)) {
      const currentDistance = distance(getTouches(event));
      const initialDistance = distance(initialTouches);
      const increasedDistance = currentDistance - initialDistance;
      const diffDistance = this.prevDistance - increasedDistance;

      //TOOD: Need to make this handle the 360->0 transition better
      let currentAngle = angle(getTouches(event), false);
      let newAngle = this.prevAngle
      if(this.initialAngle === undefined)
      {
        this.initialAngle = currentAngle
      }
      else {
        const tempNewAngle = (currentAngle - this.initialAngle);

        const nA1 = tempNewAngle
        const nA2 = tempNewAngle + 360
        const nA3 = tempNewAngle - 360

        const diff1 = Math.abs(this.prevAngle - nA1)
        const diff2 = Math.abs(this.prevAngle - nA2)
        const diff3 = Math.abs(this.prevAngle - nA3)

        if(diff1 < diff2 && diff1 < diff3) {
          newAngle = nA1
        }
        else if(diff2 < diff3) {
          newAngle = nA2
        }
        else {
          newAngle = nA3
        }
      }
      diffAngle = (this.prevAngle - newAngle) * rotateFactor;

      this.pinchStyles = { transform: [] };

      if (scalable) {
        this.pinchStyles.transform.push({
          scale: Math.min(Math.max(
            getScale(event, styles, diffDistance, scaleFactor),
          minScale), maxScale),
        });
      }

      if (rotatable) {
        const rotateAngle = getAngle(event, styles, diffAngle)
        if(Math.abs(diffAngle > 30))
        {
          console.tron.log("rotateAngle")
          console.tron.log({
            initialAngle:this.initialAngle,
            currentAngle, newAngle, diffAngle
          })
        }
        this.pinchStyles.transform.push({
          rotate: rotateAngle,
        });
      }

      this.prevAngle = newAngle;
      this.prevDistance = increasedDistance;
    }
  }

  getMergedStyles = () => {

    const styles = {
      ...this.props.styles,
      ...this.dragStyles,
      ...this.pinchStyles
    };
    return styles
  }

  updateStyles = () => {
    const styles = this.getMergedStyles()
    this.updateNativeStyles(styles);
    this.setState({styles})
  }

  updateNativeStyles = (styles) => {
    if (this.view) {
      this.view.setNativeProps({ styles });
    }
  }

  render() {
    const { styles } = this.state
    const { pointerEvents } = this.props;

    return (
      <View
        onLayout={(event)=>{
          var { width, height } = event.nativeEvent.layout;
          this.setState({size: {width, height}})
        }}
        ref={(view) => { this.view = view; }}
        style={styles}
        {
          ...this.pan.panHandlers
        }
        pointerEvents={pointerEvents}
      >
        {
          this.props.children
        }
      </View>
    );
  }
}
