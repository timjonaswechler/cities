use super::*;

pub(super) fn generate(
    s: &Site,
    p: &TownhouseWithGateProfile,
    seed: u64,
) -> Result<Design, Rejection> {
    if !interval(p.length)
        || !interval(p.depth)
        || [
            p.lower_height,
            p.upper_height,
            p.roof_rise,
            p.gate_span,
            p.gate_pier,
            p.gate_spring,
            p.gate_rise,
            p.gate_wall_top,
            p.gate_roof_rise,
            p.setback,
        ]
        .into_iter()
        .any(|v| !positive(v))
        || !p
            .overhang
            .iter()
            .all(|v| v.is_finite() && *v >= 0. && *v <= 0.8)
        || p.overhang[0] > p.overhang[1]
        || p.gate_span - 2. * p.gate_pier < 2.4
        || p.gate_spring < 2.
        || p.gate_spring + p.gate_rise >= p.gate_wall_top
        || p.gate_wall_top >= p.lower_height + p.upper_height
        || p.gate_wall_top + p.gate_roof_rise >= p.lower_height + p.upper_height + p.roof_rise
        || p.overhang[1] > p.depth[0] * 0.15
    {
        return Err(invalid(
            "Townhouse requires ordered storey dimensions, a bounded overhang, subordinate gate roof and an opening at least 2.4 m wide / 2 m high",
        ));
    }
    // A resolved interval is a promise: hard permission never silently shrinks it.
    if p.overhang[1] > s.max_overhang + EPS {
        return Err(no_fit(
            "Required upper-storey overhang exceeds the site's hard permission",
        ));
    }
    let mut rng = Rng(seed);
    let foot = place(
        s,
        p.length,
        p.depth,
        p.setback,
        p.gate_span,
        SectionSampling::Both,
        &mut rng,
    )?;
    let front = sub(s.ground[1], s.ground[0]);
    let u = mul(front, 1. / length(front));
    let v = Point { x: -u.z, z: u.x };
    let overhang = rng.range(p.overhang);
    let mut upper = foot;
    for i in [0, 1] {
        upper[i] = sub(upper[i], mul(v, overhang));
    }
    for i in [0, 3] {
        upper[i] = sub(upper[i], mul(u, overhang * 0.5));
    }
    let upper_top = p.lower_height + p.upper_height;
    let gate = [
        foot[1],
        add(foot[1], mul(u, p.gate_span)),
        add(foot[2], mul(u, p.gate_span)),
        foot[2],
    ];
    let parts = vec![
        Part {
            role: PartRole::LowerStorey,
            footprint: foot,
            base: 0.,
            wall_top: p.lower_height,
            roof: None,
            opening: None,
        },
        Part {
            role: PartRole::UpperStorey,
            footprint: upper,
            base: p.lower_height,
            wall_top: upper_top,
            roof: Some(roof(upper, upper_top, p.roof_rise, RidgeAxis::AlongFront)),
            opening: None,
        },
        Part {
            role: PartRole::Gate,
            footprint: gate,
            base: 0.,
            wall_top: p.gate_wall_top,
            roof: Some(roof(
                gate,
                p.gate_wall_top,
                p.gate_roof_rise,
                RidgeAxis::IntoSite,
            )),
            opening: Some(ArchOpening {
                interval: [p.gate_pier / p.gate_span, 1. - p.gate_pier / p.gate_span],
                spring: p.gate_spring,
                rise: p.gate_rise,
            }),
        },
    ];
    if parts.iter().any(|part| !fits(part, s)) {
        return Err(no_fit(
            "Storeys or gate violate ground contact, upper projection, roof height or reserved passage clearance",
        ));
    }
    Ok(Design {
        building_type: BuildingType::TownhouseWithGate,
        parts,
        notes: vec![],
    })
}
