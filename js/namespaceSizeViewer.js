'use strict';

!function(d3) {
    //TODO: from http://bl.ocks.org/mbostock/1276463
    // Register the "sv" namespace prefix for our custom elements.
    d3.ns.prefix.sv = "http://artzub.com/d3/sv";

    /**
     * We'll use only three tag:
     * — scene - a scene which has some group or path
     * — g - a group items
     * — path - a path element
     *
     * a structure of a node
     * +-- scene - [1..n]
     * +--+-- g - [0..n]
     * +--+--+-- path - [0..n]
     * +--+-- path - [0..n]
     * then n >= 1.
     */

    d3.helper = d3.helper || {};
    d3.helper.sv = {
        init: init
    };

    /**
     * Initialize element <sv:scene></sv:scene>
     * Function creates a canvas (HTMLCanvasElement) inside the parent node for scene;
     * and initializes process of drawing for children elements of scene.
     * @param selection
     */
    function init(selection) {
        selection.each(function () {
            var root = this
                , canvas = root.parentNode.appendChild(document.createElement("canvas"))
                , ctx = canvas.getContext("2d");

            canvas.style.position = "absolute";
            canvas.style.top = root.offsetTop + "px";
            canvas.style.left = root.offsetLeft + "px";

            /**
             * Makes invalidate the canvas for redrawing
             */
            selection.invalidate = function () {
                valid = false;
                return selection;
            };

            /**
             * Makes the state in always invalid in order to always redraw
             */
            selection.invalidAlways = function () {
                always = true;
                return selection;
            };

            /**
             * Makes the state invalid once
             */
            selection.invalidOnce = function () {
                always = false;
                return selection;
            };

            var valid, always;

            !function doRender() {
                requestAnimationFrame(doRender, undefined);

                if (!ctx || (valid && !always))
                    return;

                valid = true;

                ctx.save();

                // clear canvas
                canvas.width = root.getAttribute("width");
                canvas.height = root.getAttribute("height");

                ctx.drawImage(redraw(), 0, 0);
                ctx.restore();
            }();


            var bufCanvas, bufCtx;

            function redraw() {
                if (!bufCanvas) {
                    bufCanvas = document.createElement('canvas');
                    bufCtx = bufCanvas.getContext('2d');
                }

                bufCtx.save();
                bufCanvas.width = canvas.width;
                bufCanvas.height = canvas.height;

                var t = calcTransform(root.getAttribute("transform"));

                if (t) {
                    bufCtx.translate(t.translate[0], t.translate[1]);
                    bufCtx.scale(t.scale[0], t.scale[1]);
                }

                draw(root);

                bufCtx.restore();
                return bufCanvas;
            }

            function draw(item) {
                var d
                    , stroke
                    , fill
                    , child
                    , transform
                    , lastState = []
                    , state
                    , breakFor
                    , l
                    , nodes
                    , slice = [].slice
                    , lastColor
                    , closePath
                    ;

                nodes = slice.apply(item.childNodes);
                l = nodes.length;

                while (true) {
                    breakFor = false;

                    while (--l > -1) {
                        child = nodes[l];

                        transform = calcTransform(child.getAttribute("transform"));

                        if (transform) {
                            bufCtx.translate(transform.translate[0], transform.translate[1]);
                            bufCtx.scale(transform.scale[0], transform.scale[1]);
                        }

                        switch (child.tagName) {
                            case "g":
                                lastState.push({n: nodes, l: l});
                                nodes = slice.apply(child.childNodes).reverse();
                                l = nodes.length;

                                breakFor = true;
                                break;
                            case "path" :
                                stroke = child.getAttribute('stroke') || (child.style ? child.style.stroke : null);
                                fill = child.getAttribute('fill') || (child.style ? child.style.fill : null);

                                if (fill !== lastColor) {

                                    if (closePath) {
                                        bufCtx.closePath();
                                        bufCtx.fill();
                                        bufCtx.stroke();
                                    }

                                    bufCtx.strokeStyle = stroke && stroke.length ? stroke : "none";
                                    bufCtx.fillStyle = fill && fill.length ? fill : "none";

                                    lastColor = fill;
                                    closePath = true;
                                    bufCtx.beginPath();
                                }

                                d = child.getAttribute('d');
                                if (d && d.length) {
                                    child.path = Path(d);
                                    child.path.draw(bufCtx, true);
                                }
                                break;
                        }

                        if (breakFor)
                            break;

                        if (transform) {
                            bufCtx.translate(-transform.translate[0], -transform.translate[1]);
                            bufCtx.scale(1 / transform.scale[0], 1 / transform.scale[1]);
                        }
                    }

                    if (closePath) {
                        bufCtx.closePath();
                        bufCtx.fill();
                        bufCtx.stroke();
                    }

                    if (l < 0) {
                        if (!lastState.length)
                            break;

                        state = lastState.pop();
                        l = state.l;
                        nodes = state.n;
                        child = nodes[l];

                        transform = calcTransform(child.getAttribute("transform"));

                        if (transform) {
                            bufCtx.translate(-transform.translate[0], -transform.translate[1]);
                            bufCtx.scale(1 / transform.scale[0], 1 / transform.scale[1]);
                        }

                        l--;
                    }
                }
            }

            function calcTransform(attr) {
                if (!attr || !attr.length || typeof attr !== 'string')
                    return null;

                var result = {
                        translate: [0, 0],
                        scale: [1, 1]
                    }
                    , t = /.*translate\(\s*([\+-]?\d*\.?\d+)\s*,\s*([\+-]?\d*\.?\d+)\s*\).*/
                    , s = /.*scale\(\s*([\+-]?\d*\.?\d+)\s*,\s*([\+-]?\d*\.?\d+)\s*\).*/
                    ;

                attr = attr.toLowerCase();

                t = t.test(attr)
                    ? [].concat(attr.replace(t, '$1,$2').split(','))
                    : null
                ;
                s = s.test(attr)
                    ? [].concat(attr.replace(s, '$1,$2').split(','))
                    : null
                ;

                if (t instanceof Array) {
                    result.translate[0] = +t[0];
                    result.translate[1] = +t[1];
                }

                if (s instanceof Array) {
                    result.scale[0] = +s[0];
                    result.scale[1] = +s[1];
                }
                return result;
            }

            var moveCanvas, moveCtx, lastHovered;

            /**
             * Call a on-method of the last hovered element.
             * @param method - a string name a on-method
             * @param event - d3.event
             */
            function callMethod(method, event) {
                if (!lastHovered || !method)
                    return;

                method = lastHovered.on(method);

                if (!method)
                    return;

                method.call(
                    lastHovered.node(),
                    lastHovered.datum(),
                    event
                );
            }

            function moveMouse() {
                var mp = d3.mouse(this);

                if (!moveCanvas) {
                    moveCanvas = document.createElement('canvas');
                    moveCtx = moveCanvas.getContext('2d');
                }

                moveCtx.save();
                moveCanvas.width = canvas.width;
                moveCanvas.height = canvas.height;

                var t = calcTransform(root.getAttribute("transform"));

                if (t) {
                    bufCtx.translate(t.translate[0], t.translate[1]);
                    bufCtx.scale(t.scale[0], t.scale[1]);
                }

                calcMovement(root, mp, d3.event);
            }

            function calcMovement(item, mp, event) {
                var d
                    , child
                    , transform
                    , lastState = []
                    , state
                    , breakFor
                    , l
                    , nodes
                    , reverse = [].reverse
                    ;

                nodes = reverse.apply(item.childNodes);
                l = nodes.length;

                while (true) {
                    breakFor = false;
                    while (--l > -1) {
                        child = nodes[l];

                        transform = calcTransform(child.getAttribute("transform"));

                        if (transform) {
                            moveCtx.translate(transform.translate[0], transform.translate[1]);
                            moveCtx.scale(transform.scale[0], transform.scale[1]);
                        }

                        switch (child.tagName) {
                            case "g":
                                lastState.push({n: nodes, l: l});
                                nodes = reverse.apply(child.childNodes);
                                l = nodes.length;

                                breakFor = true;
                                break;
                            case "path" :
                                if (!child.path)
                                    continue;

                                d = child.getAttribute('d');

                                if (!d && !d.length)
                                    continue;

                                child.path.draw(moveCtx);
                                if (moveCtx.isPointInPath(mp[0], mp[1])) {
                                    if (lastHovered && lastHovered.node() === child) {
                                        callMethod('mousemove', event);
                                    }
                                    else {
                                        lastHovered = d3.select(child);
                                        callMethod('mouseover', event);
                                    }
                                    return;
                                }
                                break;
                        }

                        if (breakFor)
                            break;

                        if (transform) {
                            moveCtx.translate(-transform.translate[0], -transform.translate[1]);
                            moveCtx.scale(1 / transform.scale[0], 1 / transform.scale[1]);
                        }
                    }

                    if (l < 0) {
                        if (!lastState.length)
                            break;

                        state = lastState.pop();
                        l = state.l;
                        nodes = state.n;
                        child = nodes[l];

                        transform = calcTransform(child.getAttribute("transform"));

                        if (transform) {
                            moveCtx.translate(-transform.translate[0], -transform.translate[1]);
                            moveCtx.scale(1 / transform.scale[0], 1 / transform.scale[1]);
                        }

                        l--;
                    }
                }
                callMethod('mouseout', event);
                lastHovered = null;
            }

            d3.select('canvas')
                .on('mousemove', moveMouse)
                .on('click', function () {
                    callMethod('click', d3.event);
                });
        });
    }
}(d3);