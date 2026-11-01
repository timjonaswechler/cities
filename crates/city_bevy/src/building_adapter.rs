//! One metre in building_core is one Bevy world unit. No city-map scaling here.
use bevy::{
    asset::RenderAssetUsages, mesh::Indices, prelude::*, render::render_resource::PrimitiveTopology,
};
use building_core::{Design, Material, SurfaceMesh, derive_meshes};

pub fn surface_mesh(surface: SurfaceMesh) -> Mesh {
    let positions: Vec<[f32; 3]> = surface
        .positions
        .iter()
        .map(|p| p.map(|v| v as f32))
        .collect();
    let normals: Vec<[f32; 3]> = surface
        .normals
        .iter()
        .map(|p| p.map(|v| v as f32))
        .collect();
    let uv = vec![[0_f32; 2]; positions.len()];
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
    .with_inserted_indices(Indices::U32(surface.indices))
}
/// Generic rendering only: no building-type dispatch or duplicate geometry.
pub fn spawn_design(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<StandardMaterial>,
    design: &Design,
) -> Vec<Entity> {
    derive_meshes(design)
        .into_iter()
        .map(|surface| {
            let color = match surface.material {
                Material::Wall => Color::srgb_u8(203, 190, 154),
                Material::Roof => Color::srgb_u8(80, 111, 128),
            };
            commands
                .spawn((
                    Mesh3d(meshes.add(surface_mesh(surface))),
                    MeshMaterial3d(materials.add(StandardMaterial {
                        base_color: color,
                        perceptual_roughness: 1.,
                        ..default()
                    })),
                ))
                .id()
        })
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adapter_preserves_core_mesh_without_city_scale() {
        let mesh = surface_mesh(SurfaceMesh {
            material: Material::Roof,
            positions: vec![[2., 3., 4.], [3., 3., 4.], [2., 4., 4.]],
            normals: vec![[0., 0., 1.]; 3],
            indices: vec![0, 1, 2],
        });
        let bevy::mesh::VertexAttributeValues::Float32x3(p) =
            mesh.attribute(Mesh::ATTRIBUTE_POSITION).unwrap()
        else {
            panic!()
        };
        assert_eq!(p[0], [2., 3., 4.]);
        assert_eq!(mesh.count_vertices(), 3);
        assert_eq!(mesh.indices().unwrap().len(), 3);
    }
}
