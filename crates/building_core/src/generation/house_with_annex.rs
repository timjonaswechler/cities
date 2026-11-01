use super::*;

pub(super) fn generate(
    s: &Site,
    p: &HouseWithAnnexProfile,
    seed: u64,
) -> Result<Design, Rejection> {
    let mut rng = Rng(seed);
    let foot = place(
        s,
        p.length,
        p.depth,
        p.setback,
        0.,
        SectionSampling::Front,
        &mut rng,
    )?;
    let main = Part {
        role: PartRole::Main,
        footprint: foot,
        base: 0.,
        wall_top: p.wall_height,
        roof: Some(roof(
            foot,
            p.wall_height,
            p.roof_rise,
            RidgeAxis::AlongFront,
        )),
        opening: None,
    };
    if !fits(&main, s) {
        return Err(no_fit(
            "Main body including roof violates ground, upper envelope, height or reserved access",
        ));
    }
    let mut design = Design {
        building_type: BuildingType::HouseWithAnnex,
        parts: vec![main],
        notes: vec![],
    };
    if p.annex == AnnexPolicy::Forbidden {
        return Ok(design);
    }
    let annex_result = (|| {
        if !s.annex_allowed {
            return Err(no_fit("Annex forbidden by the site's hard feature limit"));
        }
        let width = rng.range(p.annex_width);
        let depth = rng.range(p.annex_depth);
        let rear = crate::geometry::length(sub(foot[3], foot[2]));
        if width >= rear * 0.6 {
            return Err(no_fit(
                "Annex is too wide to remain subordinate to the main body",
            ));
        }
        let t = rng.range([0.10, 0.30]);
        if t + width / rear >= 0.95 {
            return Err(no_fit(
                "No wall interval remains for the required annex width",
            ));
        }
        let a = lerp(foot[2], foot[3], t);
        let b = lerp(foot[2], foot[3], t + width / rear);
        let edge = mul(sub(foot[3], foot[2]), 1. / rear);
        let out = Point {
            x: edge.z,
            z: -edge.x,
        };
        let annex_foot = [b, a, add(a, mul(out, depth)), add(b, mul(out, depth))];
        let wall = p.wall_height * 0.62;
        let annex = Part {
            role: PartRole::Annex,
            footprint: annex_foot,
            base: 0.,
            wall_top: wall,
            roof: Some(roof(
                annex_foot,
                wall,
                p.roof_rise * 0.42,
                RidgeAxis::IntoSite,
            )),
            opening: None,
        };
        if !fits(&annex, s)
            || overlap(&foot, &annex_foot)
            || area(&foot) <= area(&annex_foot) * 1.5
            || annex
                .roof
                .as_ref()
                .unwrap()
                .ridge
                .iter()
                .any(|r| r[1] >= p.wall_height)
        {
            return Err(no_fit(
                "Annex including roof cannot fit with free access and a lower wall-bound roof connection",
            ));
        }
        Ok(annex)
    })();
    match annex_result {
        Ok(annex) => design.parts.push(annex),
        Err(e) if p.annex == AnnexPolicy::Optional => {
            design.notes.push(format!("Optional annex omitted: {e}"))
        }
        Err(e) => return Err(e),
    }
    Ok(design)
}
