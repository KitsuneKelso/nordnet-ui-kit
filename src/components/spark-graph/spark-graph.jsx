import React, { PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import classNames from 'classnames';
import variables from '../../utilities/variables';
import debounce from 'lodash.debounce';
import './spark-graph.scss';
import { interpolateObject } from 'd3-interpolate';

class SparkGraph extends React.Component {
  constructor(props) {
    super(props);
    const width = props.width || 0;
    const height = props.height || 0;
    this.state = {
      width,
      height,
      shouldResize: !(typeof window === 'undefined') && (!props.width || !props.height),
      pointsFrom: null,
      pointsTo: null,
    };

    this.handleResize = debounce(this.handleResize.bind(this), 150).bind(this);
  }

  componentDidMount() {
    if (this.state.shouldResize) {
      this.handleResize();
      window.addEventListener('resize', this.handleResize);
    }
  }

  componentWillReceiveProps({ width, height, points }) {
    const state = {};
    if (width) state.width = width;
    if (height) state.height = height;
    if (points && !this.arraysEqual(this.props.points, points)) {
      state.pointsFrom = this.props.points;
      state.pointsTo = points;
    } else {
      state.pointsFrom = null;
    }
    this.setState(state);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  componentDidUpdate() {
    const { strokeWidth, transformTime } = this.props;
    const { height, width, pointsFrom, pointsTo } = this.state;
    if (pointsFrom) {
      let pFrom = this.transformPoints(pointsFrom, height, width, strokeWidth);
      let pTo = this.transformPoints(pointsTo, height, width, strokeWidth);
      if (pFrom.length < pTo.length) {
        pFrom = this.addPointsToArray(pFrom, pTo.length - pFrom.length);
      } else if (pFrom.length > pTo.length) {
        pTo = this.addPointsToArray(pTo, pFrom.length - pTo.length);
      }

      const interpolates = pFrom.map((v, i) => interpolateObject(v, pTo[i]));
      // 60 fps
      const steps = Math.round(transformTime * 60 / 1000);
      const timePerSteps = Math.floor(transformTime / steps);
      const interpolatePerStep = 1 / steps;
      let s = steps;
      const interval = setInterval((polates) => {
        if (s <= 0) {
          clearInterval(interval);
        }
        const values = polates.map(ip => ip(1 - (s * interpolatePerStep)));
        this.path.setAttribute('d', this.constructPathString(values));
        s--;
      }, timePerSteps, interpolates);
    }
  }

  componentWillUnmount() {
    if (this.state.shouldResize) {
      window.removeEventListener('resize', this.handleResize);
    }
  }

  getStrokeDirection(points, stroke) {
    if (stroke) {
      return stroke;
    }

    if (points[0] > points[points.length - 1]) {
      return variables.colorDanger;
    } else if (points[0] < points[points.length - 1]) {
      return variables.colorSuccess;
    }

    return variables.colorText;
  }

  arraysEqual(array1, array2) {
    if (array1.length !== array2.length) {
      return false;
    }
    for (let i = array1.length; i--;) {
      if (array1[i] !== array2[i]) {
        return false;
      }
    }
    return true;
  }

  handleResize() {
    const rect = this.svgNode.getBoundingClientRect();

    if (rect.height !== this.state.height || rect.width !== this.state.width) {
      this.setState({
        width: rect.width,
        height: rect.height,
      });
    }
  }

  transformPoints(points, height, width, strokeWidth) {
    const xScale = width / (points.length - 1);
    const effectiveHeight = height - strokeWidth;
    const strokeCompensation = strokeWidth / 2;
    const min = Math.min(...points);
    const max = Math.max(...points);

    if (min === max) {
      // The line must be exactly horizontal, normalization not possible
      return [{ x: 0, y: height / 2 }, { x: width, y: height / 2 }];
    }


    return points.map((point, index) => (
      {
        x: index * xScale,
        y: (effectiveHeight + strokeCompensation) - (((point - min) / (max - min)) * effectiveHeight),
      }
    ));
  }

  addPointsToArray(points, numberOfPoints) {
    const pointsPerSpace = Math.floor((numberOfPoints - 1) / (points.length - 1)) + 1;
    const pointsOnLast = ((numberOfPoints - 1) % (points.length - 1)) + 1;
    const xDiff = points[1].x - points[0].x;

    if (numberOfPoints === 1) {
      points.push(points[points.length - 1]);
      return points;
    }

    const [first, ...rest] = points;

    return rest.reduce((prev, curr, index, arr) => {
      let pointsToAdd;
      if (index < arr.length - pointsOnLast) {
        pointsToAdd = pointsPerSpace - 1;
      } else {
        pointsToAdd = pointsPerSpace;
      }
      const prevPoint = prev[prev.length - 1];
      const currPoint = curr;
      for (let i = 1 / (pointsToAdd + 1); i <= 1; i += 1 / (pointsToAdd + 1)) {
        prev.push({
          x: prevPoint.x + (i * xDiff),
          y: prevPoint.y + (i * (currPoint.y - prevPoint.y)),
        });
      }
      return prev;
    }, [first]);
  }

  constructPathString(points) {
    const [first, ...rest] = points;

    return rest.reduce((prev, curr) => (
      `${prev} L ${curr.x} ${curr.y}`
    ), `M ${first.x} ${first.y}`);
  }

  render() {
    const {
      points,
      stroke,
      strokeWidth,
      className,
      style,
      ...rest,
    } = this.props;
    const { width, height, pointsFrom } = this.state;
    // TODO: Polyfill Object.assign because IE
    const styles = Object.assign({
      width: !this.props.width ? '100%' : `${width}px`,
      height: !this.props.height ? '100%' : `${height}px`,
    }, style);
    let pointsToRender;
    if (pointsFrom) {
      // Do nothing
    } else {
      pointsToRender = this.transformPoints(points, height, width, strokeWidth);
    }

    return (
      <svg
        { ...rest }
        className={ classNames('spark-graph', className) }
        style={ styles }
        viewBox={ `0 0 ${width} ${height}` }
        ref={ (node) => {
          this.svgNode = node;
        } }
      >
        <path
          className="spark-graph__path"
          d={ !pointsFrom ? this.constructPathString(pointsToRender) : '' }
          stroke={ this.getStrokeDirection(points, stroke) }
          strokeWidth={ strokeWidth }
          strokeLinecap="square"
          strokeLinejoin="round"
          ref={ (node) => {
            this.path = node;
          } }
        />
      </svg>
    );
  }
}

SparkGraph.propTypes = {
  points: PropTypes.arrayOf(PropTypes.number).isRequired,
  /** Stroke color */
  stroke: PropTypes.string,
  strokeWidth: PropTypes.number,
  /** Unitless pixel value */
  width: PropTypes.number,
  /** Unitless pixel value */
  height: PropTypes.number,
  /** Transformtime in ms */
  transformTime: PropTypes.number,
  className: PropTypes.string,
  style: PropTypes.object,
};

SparkGraph.defaultProps = {
  strokeWidth: 1,
  transformTime: 500,
};

export default SparkGraph;
