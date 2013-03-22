/**
 * User: ArtZub
 * Date: 06.03.13
 * Time: 17:29
 */

d3.helper = d3.helper || {};

d3.helper.progressbar = function(selection) {
    function displayLength(node) {
        return node.clientWidth
            || (node.getComputedTextLength
                ? node.getComputedTextLength()
                : node.innerText
                ? node.innerText.length
                : node.textContent
                ? node.textContent.length
                : 0
            );
    }

    function progress(g) {
        var w = 100, h = 20
            , pp = {x:3, y:3}
            , bar = g.append("rect")
                .attr("x", 0)
                .attr("y", 0)
                .style("fill", "rgba(0, 0, 0, .4)")
                .style("stroke", "rgba(0, 0, 0, .8)")
            , subg = g.append("g")
            , prog = subg.append("rect")
                .attr("x", pp.x)
                .attr("y", pp.y)
                .style("fill", "rgba(51, 173, 255, .8)")
                .style("stroke", "none")
            , label = subg.append("text").attr("fill", "#CEEBFF")
            , max = 100
            , pos = 0
            , ta
            ;

        g.hide = function() {
            g.style("display", "none");
        };
        g.show = function() {
            g.style("display", null);
            return g;
        };
        g.max = function() {
            if (!arguments.length) return max;
            max = parseInt(arguments[0]);
            g.pos(pos);
            return g;
        };
        g.pos = function() {
            if (!arguments.length) return pos;
            pos = parseInt(arguments[0]);

            var ww = (w - pp.x * 2) * pos/(max || 1);

            if (ww - pp.x < displayLength(label.node())) {
                ta = ta || g.textPosition();
                label.style("text-anchor", "start");
            }
            else if (ta) {
                g.textPosition(ta);
            }
            var t = g.textPosition(),
                tr = [0, 0];

            switch (t) {
                case "middle" :
                    tr = [(ww - pp.x) / 2, 0];
                    break;
                case "end":
                    tr = [ww - pp.x, 0];
                    break;
            }
            label.attr("transform", "translate(" + tr + ")");
            prog.attr("width", ww);
            return g;
        };
        g.label = function() {
            if (!arguments.length) return label.text();
            label.text(arguments[0]);
            return g;
        };
        g.textPosition = function() {
            if (!arguments.length) return label.style("text-anchor");
            label.style("text-anchor", arguments[0]);
            ta = null;
            return g;
        };
        g.width = function() {
            if (!arguments.length) return w;
            bar.attr("width", w = parseInt(arguments[0]));
            g.pos(pos);
            return g;
        };
        g.height = function() {
            if (!arguments.length) return h;
            bar.attr("height", h = parseInt(arguments[0]));
            prog.attr("height", h - pp.y * 2);
            label.attr("dy", h - pp.y * 2);
            return g;
        };
        g.step = function() {
            return g.pos(pos + (parseInt(arguments[0]) || 1));
        };

        g.textPosition("start").width(w).height(h);
    }

    return selection.call(progress);
};